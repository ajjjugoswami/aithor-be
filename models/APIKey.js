const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
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
  uniqueId: {
    type: String,
    unique: true,
    default: () => require('crypto').randomUUID()
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

// Indexes:
// - Keep a non-unique index for queries by provider per user (performance)
// - Add a UNIQUE index on (userId, provider, key) to prevent storing the same raw key twice
//   for the same user and provider.
apiKeySchema.index({ userId: 1, provider: 1 });
apiKeySchema.index({ userId: 1, provider: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('APIKey', apiKeySchema);