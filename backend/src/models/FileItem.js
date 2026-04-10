const mongoose = require('mongoose');

const fileItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['file', 'folder'], required: true },
  // file-only fields
  mimeType: { type: String },
  size: { type: Number, default: 0 },
  storagePath: { type: String }, // relative path inside uploads dir
  // common
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'FileItem', default: null }, // null = root
  isStarred: { type: Boolean, default: false },
  isTrashed: { type: Boolean, default: false },
  trashedAt: { type: Date, default: null },
  // internal sharing: users who have been granted access
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

fileItemSchema.index({ owner: 1, parent: 1, isTrashed: 1 });
fileItemSchema.index({ owner: 1, name: 'text' });

module.exports = mongoose.model('FileItem', fileItemSchema);
