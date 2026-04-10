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

// Helper: build the owner filter depending on role
// Admin: no owner restriction. User: must own OR be in sharedWith.
function ownerFilter(user, extra = {}) {
  if (user.role === 'admin') return extra;
  return { ...extra };
}

// Helper: build the access query for a regular user
function accessQuery(user, extra = {}) {
  if (user.role === 'admin') return extra;
  return {
    ...extra,
    $or: [
      { owner: user._id },
      { sharedWith: user._id },
    ],
  };
}

// ── GET /api/files ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { parent, view, search } = req.query;
    const isAdmin = req.user.role === 'admin';

    let query = {};

    if (search) {
      query.name = { $regex: search, $options: 'i' };
      query.isTrashed = false;
      if (!isAdmin) query.$or = [{ owner: req.user._id }, { sharedWith: req.user._id }];
    } else if (view === 'starred') {
      query.isStarred = true;
      query.isTrashed = false;
      if (!isAdmin) query.owner = req.user._id;
    } else if (view === 'trash') {
      query.isTrashed = true;
      if (!isAdmin) query.owner = req.user._id;
    } else if (view === 'recent') {
      query.isTrashed = false;
      query.type = 'file';
      if (!isAdmin) query.$or = [{ owner: req.user._id }, { sharedWith: req.user._id }];
    } else if (view === 'shared') {
      // files shared WITH the current user by others
      query.isTrashed = false;
      query.sharedWith = req.user._id;
    } else {
      // normal folder browsing
      query.parent = parent || null;
      query.isTrashed = false;
      if (!isAdmin) query.$or = [{ owner: req.user._id }, { sharedWith: req.user._id }];
    }

    let q = FileItem.find(query)
      .populate('owner', 'name email')
      .sort({ type: 1, name: 1 });

    if (view === 'recent') q = q.sort({ updatedAt: -1 }).limit(50);

    const files = await q;
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/files/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const query = buildSingleQuery(req.params.id, req.user);
    const file = await FileItem.findOne(query).populate('owner', 'name email');
    if (!file) return res.status(404).json({ message: 'Not found' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/files/:id/breadcrumb ──────────────────────────────────────────
router.get('/:id/breadcrumb', async (req, res) => {
  try {
    const crumbs = [];
    let current = await FileItem.findOne(buildSingleQuery(req.params.id, req.user));
    if (!current) return res.status(404).json({ message: 'Not found' });

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

    const folder = await FileItem.create({ name, type: 'folder', owner: req.user._id, parent: parent || null });
    const populated = await folder.populate('owner', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/files/upload ─────────────────────────────────────────────────
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ message: 'No files uploaded' });
    const { parent } = req.body;
    const created = [];
    let totalSize = 0;

    for (const f of req.files) {
      const fileItem = await FileItem.create({
        name: f.originalname,
        type: 'file',
        mimeType: f.mimetype,
        size: f.size,
        storagePath: f.filename,
        owner: req.user._id,
        parent: parent || null,
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
    const fileItem = await FileItem.findOne({ ...buildSingleQuery(req.params.id, req.user), type: 'file' });
    if (!fileItem) return res.status(404).json({ message: 'File not found' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const oldPath = path.join(uploadDir, fileItem.storagePath);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

    const sizeDiff = req.file.size - fileItem.size;
    fileItem.storagePath = req.file.filename;
    fileItem.size = req.file.size;
    fileItem.mimeType = req.file.mimetype;
    fileItem.name = req.file.originalname;
    await fileItem.save();
    await User.findByIdAndUpdate(fileItem.owner, { $inc: { storageUsed: sizeDiff } });
    await fileItem.populate('owner', 'name email');
    res.json(fileItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── PUT /api/files/:id — rename / move / star ──────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { name, parent, isStarred } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (parent !== undefined) update.parent = parent || null;
    if (isStarred !== undefined) update.isStarred = isStarred;

    const file = await FileItem.findOneAndUpdate(
      buildSingleQuery(req.params.id, req.user),
      update, { new: true }
    ).populate('owner', 'name email');
    if (!file) return res.status(404).json({ message: 'Not found' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/files/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const fileItem = await FileItem.findOne(buildSingleQuery(req.params.id, req.user));
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
    const query = { ...buildSingleQuery(req.params.id, req.user), isTrashed: true };
    const fileItem = await FileItem.findOne(query);
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
    const fileItem = await FileItem.findOne({ ...buildSingleQuery(req.params.id, req.user), type: 'file' });
    if (!fileItem) return res.status(404).json({ message: 'Not found' });

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
    const fileItem = await FileItem.findOne({ ...buildSingleQuery(req.params.id, req.user), type: 'file' });
    if (!fileItem) return res.status(404).json({ message: 'Not found' });

    const filePath = path.join(uploadDir, fileItem.storagePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File missing' });

    res.setHeader('Content-Type', fileItem.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', fileItem.size);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/files/:id/share-user — share with registered user ────────────
router.post('/:id/share-user', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    // Only owner or admin can share
    const fileItem = await FileItem.findOne({ _id: req.params.id, isTrashed: false });
    if (!fileItem) return res.status(404).json({ message: 'File not found' });
    if (req.user.role !== 'admin' && fileItem.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const targetUser = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!targetUser) return res.status(404).json({ message: 'User not found or inactive' });
    if (targetUser._id.toString() === fileItem.owner.toString()) {
      return res.status(400).json({ message: 'Cannot share with the owner' });
    }

    if (!fileItem.sharedWith.includes(targetUser._id)) {
      fileItem.sharedWith.push(targetUser._id);
      await fileItem.save();
    }

    res.json({ message: `Shared with ${targetUser.name}`, user: { _id: targetUser._id, name: targetUser.name, email: targetUser.email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE /api/files/:id/share-user/:userId — revoke internal share ───────
router.delete('/:id/share-user/:userId', async (req, res) => {
  try {
    const fileItem = await FileItem.findOne({ _id: req.params.id });
    if (!fileItem) return res.status(404).json({ message: 'File not found' });
    if (req.user.role !== 'admin' && fileItem.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    fileItem.sharedWith = fileItem.sharedWith.filter(id => id.toString() !== req.params.userId);
    await fileItem.save();
    res.json({ message: 'Access revoked' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/files/:id/shared-users — list users with access ──────────────
router.get('/:id/shared-users', async (req, res) => {
  try {
    const fileItem = await FileItem.findOne({ _id: req.params.id })
      .populate('sharedWith', 'name email');
    if (!fileItem) return res.status(404).json({ message: 'Not found' });
    if (req.user.role !== 'admin' && fileItem.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    res.json(fileItem.sharedWith);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function buildSingleQuery(id, user) {
  if (user.role === 'admin') return { _id: id };
  return { _id: id, $or: [{ owner: user._id }, { sharedWith: user._id }] };
}

async function trashRecursive(item) {
  item.isTrashed = true;
  item.trashedAt = new Date();
  await item.save();
  if (item.type === 'folder') {
    const children = await FileItem.find({ parent: item._id });
    for (const c of children) await trashRecursive(c);
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
    const children = await FileItem.find({ parent: item._id });
    for (const c of children) await deleteRecursive(c, ownerId);
  }
}

module.exports = router;
