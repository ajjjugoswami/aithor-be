const mongoose = require('mongoose');

const appKeySchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    unique: true
  },
  key: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastUsed: {
    type: Date
  },
  usageCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AppKey', appKeySchema);