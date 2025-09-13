const express = require('express');
const router = express.Router();

// Mock authentication - in production, use proper auth
const users = [
  { id: 1, email: 'user@example.com', password: 'password' }
];

// Login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  const user = users.find(u => u.email === email && u.password === password);

  if (user) {
    res.json({
      token: 'mock-jwt-token',
      user: { id: user.id, email: user.email }
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// Signup
router.post('/signup', (req, res) => {
  const { email, password } = req.body;

  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const newUser = { id: users.length + 1, email, password };
  users.push(newUser);

  res.json({
    token: 'mock-jwt-token',
    user: { id: newUser.id, email: newUser.email }
  });
});

// Verify token (mock)
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (token === 'mock-jwt-token') {
    res.json({ valid: true, user: { id: 1, email: 'user@example.com' } });
  } else {
    res.status(401).json({ valid: false });
  }
});

module.exports = router;