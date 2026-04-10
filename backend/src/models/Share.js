const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
  fileItem: { type: mongoose.Schema.Types.ObjectId, ref: 'FileItem', required: true },
  token: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, default: null }, // null = never
  downloadCount: { type: Number, default: 0 },
  label: { type: String, default: '' }, // optional description
}, { timestamps: true });

shareSchema.index({ token: 1 });
shareSchema.index({ fileItem: 1 });
shareSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Share', shareSchema);
