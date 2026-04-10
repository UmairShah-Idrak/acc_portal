const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const FileItem = require('../models/FileItem');
const User = require('../models/User');
const Share = require('../models/Share');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

router.use(auth);

// ── Access helpers ────────────────────────────────────────────────────────
//
// checkAccess: walks up the folder tree checking if userId owns the item
// or is in its sharedWith. Returns true if access is granted at any level.
async function checkAccess(itemId, userId, depth = 0) {
  if (depth > 15) return false;
  const item = await FileItem.findById(itemId).select('owner sharedWith parent');
  if (!item) return false;
  if (item.owner.equals(userId)) return true;
  if (item.sharedWith.some(id => id.equals(userId))) return true;
  if (item.parent) return checkAccess(item.parent, userId, depth + 1);
  return false;
}

// findReadable: find an item the user can read (owner, shared, or admin)
async function findReadable(id, user) {
  const item = await FileItem.findById(id).populate('owner', 'name email');
  if (!item) return null;
  if (user.role === 'admin') return item;
  const ok = await checkAccess(id, user._id);
  return ok ? item : null;
}

// findOwned: find an item only the owner (or admin) may modify
async function findOwned(id, user) {
  if (user.role === 'admin') return FileItem.findById(id).populate('owner', 'name email');
  return FileItem.findOne({ _id: id, owner: user._id }).populate('owner', 'name email');
}

// ── GET /api/files ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { parent, view, search } = req.query;
    const isAdmin = req.user.role === 'admin';

    let query = { isTrashed: false };

    if (search) {
      query.name = { $regex: search, $options: 'i' };
      if (!isAdmin) query.$or = [{ owner: req.user._id }, { sharedWith: req.user._id }];

    } else if (view === 'starred') {
      query.isStarred = true;
      if (!isAdmin) query.owner = req.user._id;

    } else if (view === 'trash') {
      query.isTrashed = true;
      if (!isAdmin) query.owner = req.user._id;

    } else if (view === 'recent') {
      query.type = 'file';
      if (!isAdmin) query.$or = [{ owner: req.user._id }, { sharedWith: req.user._id }];

    } else if (view === 'shared') {
      // files AND folders directly shared with the current user
      query.sharedWith = req.user._id;

    } else if (parent) {
      // browsing inside a folder
      if (!isAdmin) {
        const hasAccess = await checkAccess(parent, req.user._id);
        if (!hasAccess) return res.status(403).json({ message: 'No access to this folder' });
        // user has folder access → show all contents (no owner filter)
      }
      query.parent = parent;

    } else {
      // root level — own items + directly shared items
      query.parent = null;
      if (!isAdmin) query.$or = [{ owner: req.user._id }, { sharedWith: req.user._id }];
    }

    let q = FileItem.find(query)
      .populate('owner', 'name email')
      .sort({ type: 1, name: 1 });

    if (view === 'recent') q = q.sort({ updatedAt: -1 }).limit(50);

    res.json(await q);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/files/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const item = await findReadable(req.params.id, req.user);
    if (!item) return res.status(404).json({ message: 'Not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/files/:id/breadcrumb ──────────────────────────────────────────
router.get('/:id/breadcrumb', async (req, res) => {
  try {
    const item = await findReadable(req.params.id, req.user);
    if (!item) return res.status(404).json({ message: 'Not found' });

    const crumbs = [];
    let current = item;
    while (current.parent) {
      current = await FileItem.findById(current.parent);
      if (!current) break;
      crumbs.unshift({ _id: current._id, name: current.name });
    }
    res.json(crumbs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/files/folder ─────────────────────────────────────────────────
router.post('/folder', async (req, res) => {
  try {
    const { name, parent } = req.body;
    if (!name) return res.status(400).json({ message: 'Folder name required' });

    const exists = await FileItem.findOne({
      owner: req.user._id, parent: parent || null, name, type: 'folder', isTrashed: false,
    });
    if (exists) return res.status(409).json({ message: 'A folder with this name already exists here' });

    const folder = await (await FileItem.create({
      name, type: 'folder', owner: req.user._id, parent: parent || null,
    })).populate('owner', 'name email');
    res.status(201).json(folder);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/files/upload ─────────────────────────────────────────────────
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ message: 'No files uploaded' });
    const { parent } = req.body;
    const created = [];
    let totalSize = 0;

    for (const f of req.files) {
      const fileItem = await FileItem.create({
        name: f.originalname, type: 'file', mimeType: f.mimetype,
        size: f.size, storagePath: f.filename,
        owner: req.user._id, parent: parent || null,
      });
      await fileItem.populate('owner', 'name email');
      created.push(fileItem);
      totalSize += f.size;
    }
    await User.findByIdAndUpdate(req.user._id, { $inc: { storageUsed: totalSize } });
    res.status(201).json(created);
  } catch (err) {
    if (req.files) req.files.forEach(f => fs.unlink(path.join(uploadDir, f.filename), () => {}));
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/files/:id/version ────────────────────────────────────────────
router.post('/:id/version', upload.single('file'), async (req, res) => {
  try {
    const fileItem = await findOwned(req.params.id, req.user);
    if (!fileItem || fileItem.type !== 'file') return res.status(404).json({ message: 'File not found' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const oldPath = path.join(uploadDir, fileItem.storagePath);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    const sizeDiff = req.file.size - fileItem.size;
    Object.assign(fileItem, {
      storagePath: req.file.filename, size: req.file.size,
      mimeType: req.file.mimetype, name: req.file.originalname,
    });
    await fileItem.save();
    await User.findByIdAndUpdate(fileItem.owner, { $inc: { storageUsed: sizeDiff } });
    await fileItem.populate('owner', 'name email');
    res.json(fileItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/files/:id — rename / move / star (owner or admin only) ────────
router.put('/:id', async (req, res) => {
  try {
    const { name, parent, isStarred } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (parent !== undefined) update.parent = parent || null;
    if (isStarred !== undefined) update.isStarred = isStarred;

    const ownerQ = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, owner: req.user._id };
    const file = await FileItem.findOneAndUpdate(ownerQ, update, { new: true }).populate('owner', 'name email');
    if (!file) return res.status(404).json({ message: 'Not found' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/files/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const fileItem = await findOwned(req.params.id, req.user);
    if (!fileItem) return res.status(404).json({ message: 'Not found' });

    if (req.query.permanent === 'true' || fileItem.isTrashed) {
      await deleteRecursive(fileItem, fileItem.owner);
      return res.json({ message: 'Deleted permanently' });
    }
    await trashRecursive(fileItem);
    res.json({ message: 'Moved to trash' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/files/:id/restore ────────────────────────────────────────────
router.post('/:id/restore', async (req, res) => {
  try {
    const ownerQ = req.user.role === 'admin'
      ? { _id: req.params.id, isTrashed: true }
      : { _id: req.params.id, owner: req.user._id, isTrashed: true };
    const fileItem = await FileItem.findOne(ownerQ);
    if (!fileItem) return res.status(404).json({ message: 'Not found in trash' });

    fileItem.isTrashed = false;
    fileItem.trashedAt = null;
    fileItem.parent = null;
    await fileItem.save();
    await fileItem.populate('owner', 'name email');
    res.json(fileItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/files/:id/download ────────────────────────────────────────────
router.get('/:id/download', async (req, res) => {
  try {
    const fileItem = await findReadable(req.params.id, req.user);
    if (!fileItem || fileItem.type !== 'file') return res.status(404).json({ message: 'Not found' });

    const filePath = path.join(uploadDir, fileItem.storagePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File missing from storage' });

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileItem.name)}"`);
    res.setHeader('Content-Type', fileItem.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', fileItem.size);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/files/:id/preview ─────────────────────────────────────────────
router.get('/:id/preview', async (req, res) => {
  try {
    const fileItem = await findReadable(req.params.id, req.user);
    if (!fileItem || fileItem.type !== 'file') return res.status(404).json({ message: 'Not found' });

    const filePath = path.join(uploadDir, fileItem.storagePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File missing' });

    res.setHeader('Content-Type', fileItem.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', fileItem.size);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/files/:id/share-user ────────────────────────────────────────
router.post('/:id/share-user', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    // owner or admin can share files and folders
    const fileItem = await FileItem.findOne({ _id: req.params.id, isTrashed: false });
    if (!fileItem) return res.status(404).json({ message: 'Item not found' });
    if (req.user.role !== 'admin' && !fileItem.owner.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only the owner can share this item' });
    }

    const targetUser = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!targetUser) return res.status(404).json({ message: 'User not found or inactive' });
    if (targetUser._id.equals(fileItem.owner)) {
      return res.status(400).json({ message: 'Cannot share with the owner' });
    }

    if (!fileItem.sharedWith.some(id => id.equals(targetUser._id))) {
      fileItem.sharedWith.push(targetUser._id);
      await fileItem.save();
    }

    res.json({
      message: `Shared with ${targetUser.name}`,
      user: { _id: targetUser._id, name: targetUser.name, email: targetUser.email },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/files/:id/share-user/:userId ──────────────────────────────
router.delete('/:id/share-user/:userId', async (req, res) => {
  try {
    const fileItem = await FileItem.findById(req.params.id);
    if (!fileItem) return res.status(404).json({ message: 'Item not found' });
    if (req.user.role !== 'admin' && !fileItem.owner.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    fileItem.sharedWith = fileItem.sharedWith.filter(id => !id.equals(req.params.userId));
    await fileItem.save();
    res.json({ message: 'Access revoked' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/files/:id/shared-users ──────────────────────────────────────
router.get('/:id/shared-users', async (req, res) => {
  try {
    const fileItem = await FileItem.findById(req.params.id).populate('sharedWith', 'name email');
    if (!fileItem) return res.status(404).json({ message: 'Not found' });
    if (req.user.role !== 'admin' && !fileItem.owner.equals(req.user._id)) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    res.json(fileItem.sharedWith);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Recursive helpers ─────────────────────────────────────────────────────

async function trashRecursive(item) {
  item.isTrashed = true;
  item.trashedAt = new Date();
  await item.save();
  if (item.type === 'folder') {
    for (const c of await FileItem.find({ parent: item._id })) await trashRecursive(c);
  }
}

async function deleteRecursive(item, ownerId) {
  if (item.type === 'file' && item.storagePath) {
    const filePath = path.join(uploadDir, item.storagePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await User.findByIdAndUpdate(ownerId, { $inc: { storageUsed: -item.size } });
  }
  await Share.deleteMany({ fileItem: item._id });
  await FileItem.findByIdAndDelete(item._id);
  if (item.type === 'folder') {
    for (const c of await FileItem.find({ parent: item._id })) await deleteRecursive(c, ownerId);
  }
}

module.exports = router;
