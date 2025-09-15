const { APIKey, UserQuota } = require('../models/APIKey');
const AppKey = require('../models/AppKey');

// Utility function to get app key for a provider
const getAppKey = async (provider) => {
  const keyDoc = await AppKey.findOne({ provider, isActive: true });
  return keyDoc ? keyDoc.key : null;
};

// Utility function to check if user has quota remaining (only for free providers)
const checkQuota = async (userId, provider) => {
  // Only OpenAI and Gemini have free quotas
  if (provider !== 'openai' && provider !== 'gemini') {
    return false; // No quota system for other providers
  }

  let quota = await UserQuota.findOne({ userId, provider });
  if (!quota) {
    quota = new UserQuota({ userId, provider });
    await quota.save();
  }
  return quota.usedCalls < quota.maxFreeCalls;
};

// Utility function to increment user's quota usage (only for free providers)
const incrementQuota = async (userId, provider) => {
  // Only increment quota for free providers
  if (provider === 'openai' || provider === 'gemini') {
    await UserQuota.findOneAndUpdate(
      { userId, provider },
      { $inc: { usedCalls: 1 } },
      { upsert: true }
    );
    // Also increment app key usage count
    await AppKey.findOneAndUpdate(
      { provider },
      { $inc: { usageCount: 1 }, $set: { lastUsed: new Date() } }
    );
  }
};

module.exports = {
  getAppKey,
  checkQuota,
  incrementQuota
};