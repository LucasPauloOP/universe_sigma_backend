const mongoose = require('mongoose');

const SuperstarSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    brand: {
      type: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Brand',
          required: true,
        },
        name: { type: String, required: true },
        color: String,
      },
      required: true,
    },
    division: {
      type: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Brand',
          required: true,
        },
        name: { type: String, required: true },
      },
      required: true,
    },
    alignment: {
      type: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Brand',
          required: true,
        },
        name: { type: String, required: true },
      },
    },
    weightClass: {
      type: {
        _id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Brand',
          required: true,
        },
        name: { type: String, required: true },
      },
    },
    overall: Number,
    finisher: String,
    signature: String,
    hometown: String,
    isActive: { type: Boolean, default: true },
    isCustomCharacter: { type: Boolean, default: true },
  },
  {
    // Isso cria 'createdAt' e 'updatedAt' automaticamente
    timestamps: true,
  },
);

module.exports = mongoose.model('Superstar', SuperstarSchema);
