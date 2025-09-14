const express = require('express');
const jwt = require('jsonwebtoken');
const APIKey = require('../models/APIKey');
const router = express.Router();

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.email !== 'goswamiajay526@gmail.com') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

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

// Get all users and their API keys (admin only)
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const User = require('../models/User');
    
    // Get all users
    const users = await User.find({}, 'email name _id picture');
    
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
    
    res.json(usersWithKeys);
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

module.exports = router;