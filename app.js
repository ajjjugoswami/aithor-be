const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'https://aithor.vercel.app',
    'https://chat-with-aithor.vercel.app',
    'https://aithor-be.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Handle preflight requests
app.options('*', cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'https://aithor.vercel.app',
    'https://chat-with-aithor.vercel.app',
    'https://aithor-be.vercel.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Aithor Backend API' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Chat routes will be added here
// app.use('/api/chat', require('./routes/chat'));

// Auth routes
app.use('/api/auth', require('./routes/auth'));

// API Keys routes
app.use('/api/api-keys', require('./routes/apiKeys'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;