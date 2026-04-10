const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Share = require('../models/Share');
const FileItem = require('../models/FileItem');
const { auth } = require('../middleware/auth');

const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');

// ─── Authenticated routes ──────────────────────────────────────────────────

// GET /api/shares — list shares created by me
router.get('/', auth, async (req, res) => {
  try {
    const shares = await Share.find({ createdBy: req.user._id })
      .populate('fileItem', 'name size mimeType type')
      .sort({ createdAt: -1 });
    res.json(shares);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shares/file/:fileId — get shares for a specific file
router.get('/file/:fileId', auth, async (req, res) => {
  try {
    const shares = await Share.find({ fileItem: req.params.fileId, createdBy: req.user._id }).sort({ createdAt: -1 });
    res.json(shares);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/shares — create share link
router.post('/', auth, async (req, res) => {
  try {
    const { fileId, password, expiresIn, label } = req.body;
    if (!fileId || !password) return res.status(400).json({ message: 'fileId and password required' });
    if (password.length < 4) return res.status(400).json({ message: 'Share password must be at least 4 characters' });

    const fileItem = await FileItem.findOne({ _id: fileId, owner: req.user._id, type: 'file', isTrashed: false });
    if (!fileItem) return res.status(404).json({ message: 'File not found' });

    const passwordHash = await bcrypt.hash(password, 10);
    const token = uuidv4().replace(/-/g, '');

    let expiresAt = null;
    if (expiresIn) {
      const days = parseInt(expiresIn);
      if (!isNaN(days) && days > 0) {
        expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }
    }

    const share = await Share.create({ fileItem: fileId, token, passwordHash, createdBy: req.user._id, expiresAt, label: label || '' });
    res.status(201).json(share);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/shares/:id — revoke share
router.delete('/:id', auth, async (req, res) => {
  try {
    const share = await Share.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
    if (!share) return res.status(404).json({ message: 'Share not found' });
    res.json({ message: 'Share revoked' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─── Public routes ─────────────────────────────────────────────────────────

// POST /api/shares/public/:token/verify — verify password, get file info + temp token
router.post('/public/:token/verify', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: 'Password required' });

    const share = await Share.findOne({ token: req.params.token }).populate('fileItem', 'name size mimeType');
    if (!share) return res.status(404).json({ message: 'Share link not found' });

    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ message: 'This share link has expired' });
    }

    const match = await bcrypt.compare(password, share.passwordHash);
    if (!match) return res.status(401).json({ message: 'Incorrect password' });

    // issue a short-lived download token
    const downloadToken = jwt.sign(
      { shareId: share._id.toString(), token: share.token },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({
      file: share.fileItem,
      downloadToken,
      label: share.label,
      downloadCount: share.downloadCount,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shares/public/:token/download?downloadToken=xxx
router.get('/public/:token/download', async (req, res) => {
  try {
    const { downloadToken } = req.query;
    if (!downloadToken) return res.status(401).json({ message: 'Download token required' });

    let decoded;
    try {
      decoded = jwt.verify(downloadToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Download token invalid or expired' });
    }

    if (decoded.token !== req.params.token) return res.status(401).json({ message: 'Token mismatch' });

    const share = await Share.findById(decoded.shareId).populate('fileItem');
    if (!share) return res.status(404).json({ message: 'Share not found' });

    if (share.expiresAt && share.expiresAt < new Date()) {
      return res.status(410).json({ message: 'Share link expired' });
    }

    const fileItem = share.fileItem;
    const filePath = path.join(uploadDir, fileItem.storagePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File missing from storage' });

    share.downloadCount += 1;
    await share.save();

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileItem.name)}"`);
    res.setHeader('Content-Type', fileItem.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', fileItem.size);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
