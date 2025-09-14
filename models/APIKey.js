const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  modelId: {
    type: String,
    required: true
  },
  key: {
    type: String,
    required: true
  },
  name: {
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
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Remove unique constraint - allow multiple keys per model per user
// apiKeySchema.index({ userId: 1, modelId: 1 }, { unique: true });

// Add index for better query performance
apiKeySchema.index({ userId: 1, modelId: 1 });

module.exports = mongoose.model('APIKey', apiKeySchema);