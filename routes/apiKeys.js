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

// Save or update an API key
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { modelId, key, name, isDefault = false } = req.body;

    if (!modelId || !key || !name) {
      return res.status(400).json({ error: 'modelId, key, and name are required' });
    }

    // Find existing key for this user and model
    let apiKey = await APIKey.findOne({ userId: req.user.userId, modelId });

    if (apiKey) {
      // Update existing
      apiKey.key = key;
      apiKey.name = name;
      apiKey.isDefault = isDefault;
      await apiKey.save();
    } else {
      // Create new
      apiKey = new APIKey({
        userId: req.user.userId,
        modelId,
        key,
        name,
        isDefault
      });
      await apiKey.save();
    }

    res.json(apiKey);
  } catch (error) {
    console.error('Error saving API key:', error);
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

    // If setting as default, unset all other defaults for this model
    if (isDefault) {
      const apiKey = await APIKey.findById(keyId);
      if (apiKey) {
        await APIKey.updateMany(
          { userId: req.user.userId, modelId: apiKey.modelId },
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

// Set active API key for a model
router.patch('/:keyId/active', authenticateToken, async (req, res) => {
  try {
    const { keyId } = req.params;
    
    // Find the key to get the modelId
    const apiKey = await APIKey.findById(keyId);
    if (!apiKey || apiKey.userId.toString() !== req.user.userId) {
      return res.status(404).json({ error: 'API key not found' });
    }

    // Unset all defaults for this model
    await APIKey.updateMany(
      { userId: req.user.userId, modelId: apiKey.modelId },
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