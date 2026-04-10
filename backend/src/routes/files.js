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

// GET /api/files?parent=&view=all|starred|trash|recent
router.get('/', async (req, res) => {
  try {
    const { parent, view, search } = req.query;
    let query = { owner: req.user._id };

    if (search) {
      query.name = { $regex: search, $options: 'i' };
      query.isTrashed = false;
    } else if (view === 'starred') {
      query.isStarred = true;
      query.isTrashed = false;
    } else if (view === 'trash') {
      query.isTrashed = true;
    } else if (view === 'recent') {
      query.isTrashed = false;
      query.type = 'file';
    } else {
      query.parent = parent ? parent : null;
      query.isTrashed = false;
    }

    let filesQuery = FileItem.find(query).sort({ type: 1, name: 1 });
    if (view === 'recent') filesQuery = filesQuery.sort({ updatedAt: -1 }).limit(50);

    const files = await filesQuery;
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/files/:id
router.get('/:id', async (req, res) => {
  try {
    const file = await FileItem.findOne({ _id: req.params.id, owner: req.user._id });
    if (!file) return res.status(404).json({ message: 'Not found' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/files/:id/breadcrumb — returns path to file
router.get('/:id/breadcrumb', async (req, res) => {
  try {
    const crumbs = [];
    let current = await FileItem.findOne({ _id: req.params.id, owner: req.user._id });
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

// POST /api/files/folder — create folder
router.post('/folder', async (req, res) => {
  try {
    const { name, parent } = req.body;
    if (!name) return res.status(400).json({ message: 'Folder name required' });

    const exists = await FileItem.findOne({ owner: req.user._id, parent: parent || null, name, type: 'folder', isTrashed: false });
    if (exists) return res.status(409).json({ message: 'A folder with this name already exists here' });

    const folder = await FileItem.create({ name, type: 'folder', owner: req.user._id, parent: parent || null });
    res.status(201).json(folder);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/files/upload — upload file(s)
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
      created.push(fileItem);
      totalSize += f.size;
    }

    await User.findByIdAndUpdate(req.user._id, { $inc: { storageUsed: totalSize } });
    res.status(201).json(created);
  } catch (err) {
    // clean up any uploaded files on error
    if (req.files) req.files.forEach(f => fs.unlink(path.join(uploadDir, f.filename), () => {}));
    res.status(500).json({ message: err.message });
  }
});

// POST /api/files/:id/version — replace file with new version
router.post('/:id/version', upload.single('file'), async (req, res) => {
  try {
    const fileItem = await FileItem.findOne({ _id: req.params.id, owner: req.user._id, type: 'file' });
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

    await User.findByIdAndUpdate(req.user._id, { $inc: { storageUsed: sizeDiff } });
    res.json(fileItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/files/:id — rename or move
router.put('/:id', async (req, res) => {
  try {
    const { name, parent, isStarred } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (parent !== undefined) update.parent = parent || null;
    if (isStarred !== undefined) update.isStarred = isStarred;

    const file = await FileItem.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      update,
      { new: true }
    );
    if (!file) return res.status(404).json({ message: 'Not found' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/files/:id?permanent=true
router.delete('/:id', async (req, res) => {
  try {
    const fileItem = await FileItem.findOne({ _id: req.params.id, owner: req.user._id });
    if (!fileItem) return res.status(404).json({ message: 'Not found' });

    if (req.query.permanent === 'true' || fileItem.isTrashed) {
      await deleteRecursive(fileItem, req.user._id);
      return res.json({ message: 'Deleted permanently' });
    }

    // move to trash
    await trashRecursive(fileItem);
    res.json({ message: 'Moved to trash' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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
  // delete associated shares
  await Share.deleteMany({ fileItem: item._id });
  await FileItem.findByIdAndDelete(item._id);

  if (item.type === 'folder') {
    const children = await FileItem.find({ parent: item._id });
    for (const c of children) await deleteRecursive(c, ownerId);
  }
}

// POST /api/files/:id/restore
router.post('/:id/restore', async (req, res) => {
  try {
    const fileItem = await FileItem.findOne({ _id: req.params.id, owner: req.user._id, isTrashed: true });
    if (!fileItem) return res.status(404).json({ message: 'Not found in trash' });

    fileItem.isTrashed = false;
    fileItem.trashedAt = null;
    fileItem.parent = null; // restore to root
    await fileItem.save();
    res.json(fileItem);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/files/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const fileItem = await FileItem.findOne({ _id: req.params.id, owner: req.user._id, type: 'file' });
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

// GET /api/files/:id/preview
router.get('/:id/preview', async (req, res) => {
  try {
    const fileItem = await FileItem.findOne({ _id: req.params.id, owner: req.user._id, type: 'file' });
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

module.exports = router;
