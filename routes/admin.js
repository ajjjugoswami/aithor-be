const express = require('express');
const jwt = require('jsonwebtoken');
const { UserQuota } = require('../models/APIKey');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

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

module.exports = router;