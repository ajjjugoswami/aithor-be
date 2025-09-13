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
router.delete('/:modelId', authenticateToken, async (req, res) => {
  try {
    const { modelId } = req.params;
    await APIKey.findOneAndDelete({ userId: req.user.userId, modelId });
    res.json({ message: 'API key deleted' });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;