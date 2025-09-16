const express = require('express');
const jwt = require('jsonwebtoken');
const { UserQuota } = require('../models/APIKey');
const AppKey = require('../models/AppKey');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Feedback = require('../models/Feedback');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

/**
 * @swagger
 * /api/admin/app-keys:
 *   get:
 *     summary: Get all app-owned API keys (Admin only)
 *     tags: [Admin App Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of app API keys
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/app-keys', authenticateToken, /* requireAdmin, */ async (req, res) => {
  try {
    const appKeys = await AppKey.find({}).select('-key');
    res.json(appKeys);
  } catch (error) {
    console.error('Error fetching app keys:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/admin/app-key:
 *   post:
 *     summary: Set app-owned API key for a provider (Admin only)
 *     tags: [Admin App Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider
 *               - key
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [openai, gemini]
 *               key:
 *                 type: string
 *     responses:
 *       200:
 *         description: App key updated successfully
 *       400:
 *         description: Invalid request data
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/app-key', authenticateToken, /* requireAdmin, */ async (req, res) => {
  try {
    const { provider, key } = req.body;

    console.log('Received app key request:', { provider, key: key ? '***' + key.slice(-4) : 'undefined' });

    if (!provider || !key) {
      console.log('Missing provider or key:', { provider: !!provider, key: !!key });
      return res.status(400).json({ error: 'Provider and key are required' });
    }

    if (!['openai', 'gemini'].includes(provider)) {
      console.log('Invalid provider:', provider);
      return res.status(400).json({ error: 'Invalid provider. Must be openai or gemini' });
    }

    // Check if app key already exists for this provider
    const existingKey = await AppKey.findOne({ provider });

    if (existingKey) {
      // Update existing key
      existingKey.key = key;
      existingKey.lastUsed = new Date();
      try {
        await existingKey.save();
        console.log('Updated existing app key for', provider);
      } catch (saveError) {
        console.error('Error saving existing app key:', saveError);
        return res.status(500).json({ error: 'Failed to update app key' });
      }
    } else {
      // Create new app key
      const newAppKey = new AppKey({
        provider,
        key,
        isActive: true
      });
      try {
        await newAppKey.save();
        console.log('Created new app key for', provider);
      } catch (saveError) {
        console.error('Error saving new app key:', saveError);
        return res.status(500).json({ error: 'Failed to create app key' });
      }
    }

    res.json({ message: 'App key updated successfully' });
  } catch (error) {
    console.error('Error setting app key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/admin/user-quotas:
 *   get:
 *     summary: Get user quotas (Admin only)
 *     tags: [Admin Quotas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *     responses:
 *       200:
 *         description: List of user quotas
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/user-quotas', authenticateToken, /* requireAdmin, */ async (req, res) => {
  try {
    const { userId } = req.query;
    let query = {};
    if (userId) {
      query.userId = userId;
    }

    const userQuotas = await UserQuota.find(query).populate('userId', 'email name');
    res.json(userQuotas);
  } catch (error) {
    console.error('Error fetching user quotas:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/admin/reset-quota/{userId}/{provider}:
 *   post:
 *     summary: Reset user quota for a provider (Admin only)
 *     tags: [Admin Quotas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID
 *       - in: path
 *         name: provider
 *         schema:
 *           type: string
 *           enum: [openai, gemini]
 *         required: true
 *         description: Provider
 *     responses:
 *       200:
 *         description: Quota reset successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: User quota not found
 *       500:
 *         description: Server error
 */
router.post('/reset-quota/:userId/:provider', authenticateToken, /* requireAdmin, */ async (req, res) => {
  try {
    const { userId, provider } = req.params;

    if (!['openai', 'gemini'].includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    const quota = await UserQuota.findOneAndUpdate(
      { userId, provider },
      { usedCalls: 0, updatedAt: new Date() },
      { new: true }
    );

    if (!quota) {
      return res.status(404).json({ error: 'User quota not found' });
    }

    res.json({ message: 'Quota reset successfully', quota });
  } catch (error) {
    console.error('Error resetting quota:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/admin/dashboard-stats:
 *   get:
 *     summary: Get dashboard statistics (Admin only)
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.get('/dashboard-stats', authenticateToken, /* requireAdmin, */ async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();

    // Get admin users count
    const adminUsers = await User.countDocuments({ isAdmin: true });

    // Get feedback count
    const feedbackCount = await Feedback.countDocuments();

    // Calculate growth metrics (comparing with last month)
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    const usersLastMonth = await User.countDocuments({ createdAt: { $lt: lastMonth } });
    const feedbackLastMonth = await Feedback.countDocuments({ createdAt: { $lt: lastMonth } });
    const adminsLastMonth = await User.countDocuments({ isAdmin: true, createdAt: { $lt: lastMonth } });

    const userGrowth = usersLastMonth > 0 ? ((totalUsers - usersLastMonth) / usersLastMonth * 100) : 0;
    const feedbackGrowth = feedbackLastMonth > 0 ? ((feedbackCount - feedbackLastMonth) / feedbackLastMonth * 100) : 0;
    const adminGrowth = adminsLastMonth > 0 ? ((adminUsers - adminsLastMonth) / adminsLastMonth * 100) : 0;

    const stats = {
      totalUsers,
      adminUsers,
      feedbackCount,
      growth: {
        users: Math.round(userGrowth * 100) / 100, // Round to 2 decimal places
        feedback: Math.round(feedbackGrowth * 100) / 100,
        admins: Math.round(adminGrowth * 100) / 100
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;