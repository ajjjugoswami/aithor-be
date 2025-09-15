const express = require('express');
const jwt = require('jsonwebtoken');
const { APIKey, UserQuota } = require('../models/APIKey');
const AppKey = require('../models/AppKey');
const { getAppKey, checkQuota, incrementQuota } = require('../utils/quotaUtils');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

/**
 * @swagger
 * components:
 *   schemas:
 *     APIKey:
 *       type: object
 *       required:
 *         - provider
 *         - key
 *         - name
 *       properties:
 *         _id:
 *           type: string
 *           description: The auto-generated id of the API key
 *         userId:
 *           type: string
 *           description: The user ID this key belongs to
 *         provider:
 *           type: string
 *           enum: [ChatGPT, Gemini, DeepSeek, Claude, Perplexity, Ollama]
 *           description: The AI provider this key is for
 *         name:
 *           type: string
 *           description: User-defined name for this API key
 *         key:
 *           type: string
 *           description: The actual API key (masked in responses)
 *         isDefault:
 *           type: boolean
 *           description: Whether this is the default key for the provider
 *         isActive:
 *           type: boolean
 *           description: Whether this key is active and usable
 *         usageCount:
 *           type: integer
 *           description: Number of times this key has been used
 *         lastUsed:
 *           type: string
 *           format: date-time
 *           description: Last time this key was used
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: When the key was created
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: When the key was last updated
 *       example:
 *         _id: 60d5ecb74b24c72b8c8b4567
 *         userId: 60d5ecb74b24c72b8c8b4568
 *         provider: ChatGPT
 *         name: My ChatGPT Key
 *         key: sk-************************
 *         isDefault: true
 *         isActive: true
 *         usageCount: 42
 *         lastUsed: 2023-12-01T10:30:00.000Z
 *         createdAt: 2023-11-15T08:00:00.000Z
 *         updatedAt: 2023-12-01T10:30:00.000Z
 *
 *     UserWithKeys:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: User ID
 *         email:
 *           type: string
 *           format: email
 *           description: User's email
 *         name:
 *           type: string
 *           description: User's display name
 *         picture:
 *           type: string
 *           description: User's profile picture URL
 *         isAdmin:
 *           type: boolean
 *           description: Whether user is admin
 *         apiKeys:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/APIKey'
 *           description: Array of user's API keys
 */

/**
 * @swagger
 * /api/api-keys:
 *   get:
 *     summary: Get API keys for authenticated user
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user's API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/APIKey'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Get API keys for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const apiKeys = await APIKey.find({ userId: req.user.userId });
    res.json(apiKeys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/api-keys:
 *   post:
 *     summary: Create a new API key
 *     tags: [API Keys]
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
 *               - name
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [ChatGPT, Gemini, DeepSeek, Claude, Perplexity, Ollama]
 *                 description: The AI provider for this API key
 *               key:
 *                 type: string
 *                 description: The actual API key
 *               name:
 *                 type: string
 *                 description: User-defined name for this API key
 *               isDefault:
 *                 type: boolean
 *                 default: false
 *                 description: Whether this should be the default key for the provider
 *             example:
 *               provider: ChatGPT
 *               key: sk-1234567890abcdef
 *               name: My ChatGPT Key
 *               isDefault: true
 *     responses:
 *       201:
 *         description: API key created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIKey'
 *       400:
 *         description: Bad request - Missing required fields or duplicate key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Save a new API key (always creates new, doesn't update existing)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { provider, key, name, isDefault = false } = req.body;

    if (!provider || !key || !name) {
      return res.status(400).json({ error: 'provider, key, and name are required' });
    }

    // Check if this is a duplicate key value for the same user and provider
    const existingKey = await APIKey.findOne({
      userId: req.user.userId,
      provider: provider,
      key: key
    });

    if (existingKey) {
      return res.status(400).json({ error: 'This API key already exists for this provider' });
    }

    // If setting as default, unset other defaults for this provider
    if (isDefault) {
      await APIKey.updateMany(
        { userId: req.user.userId, provider, isDefault: true },
        { isDefault: false }
      );
    }

    // Create new API key
    const apiKey = new APIKey({
      userId: req.user.userId,
      provider,
      key,
      name,
      isDefault
    });

    await apiKey.save();
    res.json(apiKey);
  } catch (error) {
    console.error('Error saving API key:', error);
    // Show more specific error for MongoDB duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate key error. This may be due to an old database index. Please run the migration script in README.md.' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Update an existing API key by ID
router.put('/:keyId', authenticateToken, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { provider, key, name, isDefault = false } = req.body;

    if (!key || !name) {
      return res.status(400).json({ error: 'key and name are required' });
    }

    const apiKey = await APIKey.findOne({
      _id: keyId,
      userId: req.user.userId
    });

    if (!apiKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Check if updating to a duplicate key value
    if (key !== apiKey.key) {
      const existingKey = await APIKey.findOne({
        userId: req.user.userId,
        key: key,
        _id: { $ne: keyId }
      });

      if (existingKey) {
        return res.status(400).json({ error: 'This API key already exists' });
      }
    }

    // If setting as default, unset other defaults for this provider
    if (isDefault && !apiKey.isDefault) {
      await APIKey.updateMany(
        { userId: req.user.userId, provider: apiKey.provider, isDefault: true },
        { isDefault: false }
      );
    }

    // Update the key
    apiKey.key = key;
    apiKey.name = name;
    apiKey.isDefault = isDefault;
    if (provider) apiKey.provider = provider; // Allow provider change if provided

    await apiKey.save();
    res.json(apiKey);
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete an API key
router.delete('/:keyId', authenticateToken, async (req, res) => {
  try {
    const { keyId } = req.params;
    const deletedKey = await APIKey.findOneAndDelete({ 
      _id: keyId, 
      userId: req.user.userId 
    });
    
    if (!deletedKey) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    res.json({ message: 'API key deleted' });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update an API key (set as default, update name, etc.)
router.put('/:keyId', authenticateToken, async (req, res) => {
  try {
    const { keyId } = req.params;
    const { name, isDefault, key } = req.body;

    // If setting as default, unset all other defaults for this provider
    if (isDefault) {
      const apiKey = await APIKey.findById(keyId);
      if (apiKey) {
        await APIKey.updateMany(
          { userId: req.user.userId, provider: apiKey.provider },
          { isDefault: false }
        );
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (key !== undefined) updateData.key = key;

    const updatedKey = await APIKey.findOneAndUpdate(
      { _id: keyId, userId: req.user.userId },
      updateData,
      { new: true }
    );

    if (!updatedKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json(updatedKey);
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Set active API key for a provider
router.patch('/:keyId/active', authenticateToken, async (req, res) => {
  try {
    const { keyId } = req.params;
    
    // Find the key to get the provider
    const apiKey = await APIKey.findById(keyId);
    if (!apiKey || apiKey.userId.toString() !== req.user.userId) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Unset all defaults for this provider
    await APIKey.updateMany(
      { userId: req.user.userId, provider: apiKey.provider },
      { isDefault: false }
    );

    // Set this key as default
    const updatedKey = await APIKey.findByIdAndUpdate(
      keyId,
      { isDefault: true },
      { new: true }
    );

    res.json(updatedKey);
  } catch (error) {
    console.error('Error setting active API key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ADMIN ROUTES - Only accessible to admin user

/**
 * @swagger
 * /api/api-keys/admin/all:
 *   get:
 *     summary: Get all users and their API keys (Admin only)
 *     tags: [Admin, API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of users per page
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filter users by name (case-insensitive)
 *       - in: query
 *         name: email
 *         schema:
 *           type: string
 *         description: Filter users by email (case-insensitive)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Legacy search parameter (searches both name and email)
 *     responses:
 *       200:
 *         description: List of all users with their API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserWithKeys'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalUsers:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Get all users and their API keys (admin only)
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const User = require('../models/User');
    const { search, name, email, page = 1, limit = 10 } = req.query;

    // Convert to numbers and set defaults
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Build search query
    let userQuery = {};
    if (search) {
      // Legacy support for single search field
      userQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      };
    } else {
      // New separate field search
      const conditions = [];
      if (name) {
        conditions.push({ name: { $regex: name, $options: 'i' } });
      }
      if (email) {
        conditions.push({ email: { $regex: email, $options: 'i' } });
      }
      if (conditions.length > 0) {
        userQuery = conditions.length === 1 ? conditions[0] : { $and: conditions };
      }
    }

    // Get users count for pagination
    const totalUsers = await User.countDocuments(userQuery);

    // Get users (filtered by search if provided) with pagination
    const users = await User.find(userQuery, 'email name _id picture isAdmin')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get all API keys with user info
    const apiKeys = await APIKey.find({})
      .populate('userId', 'email name picture')
      .sort({ createdAt: -1 });

    // Group keys by user
    const usersWithKeys = users.map(user => {
      const userKeys = apiKeys.filter(key =>
        key.userId._id.toString() === user._id.toString()
      );

      return {
        _id: user._id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        isAdmin: user.isAdmin,
        apiKeys: userKeys.map(key => ({
          _id: key._id,
          provider: key.provider,
          name: key.name,
          isActive: key.isActive,
          isDefault: key.isDefault,
          lastUsed: key.lastUsed,
          usageCount: key.usageCount,
          createdAt: key.createdAt,
          updatedAt: key.updatedAt
        }))
      };
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalUsers / limitNum);

    res.json({
      users: usersWithKeys,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalUsers,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Error fetching all users and keys:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create API key for any user (admin only) - supports multiple keys per provider
router.post('/admin/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { provider, key, name, isDefault = false } = req.body;

    if (!provider || !key || !name) {
      return res.status(400).json({ error: 'provider, key, and name are required' });
    }

    // Check if user exists
    const User = require('../models/User');
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if this is a duplicate key value
    const existingKey = await APIKey.findOne({
      userId: userId,
      key: key
    });

    if (existingKey) {
      return res.status(400).json({ error: 'This API key already exists' });
    }

    // If setting as default, unset other defaults for this provider
    if (isDefault) {
      await APIKey.updateMany(
        { userId, provider, isDefault: true },
        { isDefault: false }
      );
    }

    // Create new API key (always create new, don't update existing)
    const apiKey = new APIKey({
      userId,
      provider,
      key,
      name,
      isDefault
    });

    await apiKey.save();
    res.json(apiKey);
  } catch (error) {
    console.error('Error saving API key for user:', error);
    // Show more specific error for MongoDB duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate key error. This may be due to an old database index. Please run the migration script in README.md.' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Update API key for any user (admin only)
router.put('/admin/:userId/:keyId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, keyId } = req.params;
    const { name, isDefault, key } = req.body;

    // If setting as default, unset all other defaults for this provider
    if (isDefault) {
      const apiKey = await APIKey.findById(keyId);
      if (apiKey) {
        await APIKey.updateMany(
          { userId, provider: apiKey.provider },
          { isDefault: false }
        );
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (key !== undefined) updateData.key = key;

    const updatedKey = await APIKey.findOneAndUpdate(
      { _id: keyId, userId },
      updateData,
      { new: true }
    );

    if (!updatedKey) {
      return res.status(404).json({ error: 'API key not found' });
    }

    res.json(updatedKey);
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete API key for any user (admin only)
router.delete('/admin/:userId/:keyId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, keyId } = req.params;
    
    const deletedKey = await APIKey.findOneAndDelete({ 
      _id: keyId, 
      userId 
    });
    
    if (!deletedKey) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    res.json({ message: 'API key deleted' });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Set active API key for any user (admin only)
router.patch('/admin/:userId/:keyId/active', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, keyId } = req.params;
    
    // Find the key to get the provider
    const apiKey = await APIKey.findById(keyId);
    if (!apiKey || apiKey.userId.toString() !== userId) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Unset all defaults for this provider
    await APIKey.updateMany(
      { userId, provider: apiKey.provider },
      { isDefault: false }
    );

    // Set this key as default
    const updatedKey = await APIKey.findByIdAndUpdate(
      keyId,
      { isDefault: true },
      { new: true }
    );

    res.json(updatedKey);
  } catch (error) {
    console.error('Error setting active API key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/api-keys/admin/app-key:
 *   post:
 *     summary: Set app-owned API key for a provider (Admin only)
 *     tags: [Admin API Keys]
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
router.post('/admin/app-key', authenticateToken, /* requireAdmin, */ async (req, res) => {
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
 * /api/api-keys/admin/app-keys:
 *   get:
 *     summary: Get all app-owned API keys (Admin only)
 *     tags: [Admin API Keys]
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
router.get('/admin/app-keys', authenticateToken, /* requireAdmin, */ async (req, res) => {
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
 * /api/api-keys/admin/user-quotas:
 *   get:
 *     summary: Get user quotas (Admin only)
 *     tags: [Admin API Keys]
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
router.get('/admin/user-quotas', authenticateToken, /* requireAdmin, */ async (req, res) => {
  try {
    const { userId } = req.query;
    const query = userId ? { userId } : {};
    // Only return quotas for free providers (OpenAI and Gemini)
    query.provider = { $in: ['openai', 'gemini'] };
    const quotas = await UserQuota.find(query).populate('userId', 'email name');
    res.json(quotas);
  } catch (error) {
    console.error('Error fetching user quotas:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/api-keys/admin/reset-quota/{userId}/{provider}:
 *   post:
 *     summary: Reset user quota for a provider (Admin only)
 *     tags: [Admin API Keys]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: provider
 *         required: true
 *         schema:
 *           type: string
 *           enum: [openai, gemini]
 *     responses:
 *       200:
 *         description: Quota reset successfully
 *       403:
 *         description: Admin access required
 *       500:
 *         description: Server error
 */
router.post('/admin/reset-quota/:userId/:provider', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId, provider } = req.params;

    if (!['openai', 'gemini'].includes(provider)) {
      return res.status(400).json({ error: 'Can only reset quotas for OpenAI and Gemini providers' });
    }

    await UserQuota.findOneAndUpdate(
      { userId, provider },
      { usedCalls: 0 },
      { upsert: true }
    );

    res.json({ message: 'Quota reset successfully' });
  } catch (error) {
    console.error('Error resetting quota:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;