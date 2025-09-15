const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() { return !this.isAppKey; } // Not required for app keys
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
  },
  isAppKey: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// User Quota Schema for tracking free API calls
const userQuotaSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['openai', 'gemini']
  },
  usedCalls: {
    type: Number,
    default: 0
  },
  maxFreeCalls: {
    type: Number,
    default: 10
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
userQuotaSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports = {
  APIKey: mongoose.model('APIKey', apiKeySchema),
  UserQuota: mongoose.model('UserQuota', userQuotaSchema)
};