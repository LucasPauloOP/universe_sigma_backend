const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    gm: { type: String },
    day: Number,
    color: String,
    description: String,
    isActive: { type: Boolean, default: true },
  },
  {
    // Isso cria 'createdAt' e 'updatedAt' automaticamente
    timestamps: true,
  },
);

module.exports = mongoose.model('Brand', BrandSchema);
