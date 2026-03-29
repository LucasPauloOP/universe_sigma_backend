const mongoose = require('mongoose');

const WeightClassSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    isActive: { type: Boolean, default: true },
  },
  {
    // Isso cria 'createdAt' e 'updatedAt' automaticamente
    timestamps: true,
  },
);

module.exports = mongoose.model('WeightClass', WeightClassSchema);
