const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      // Password is required only for non-Google users
      return !this.googleId;
    }
  },
  googleId: {
    type: String,
    sparse: true // Allows null values but ensures uniqueness when present
  },
  name: {
    type: String,
    trim: true
  },
  picture: {
    type: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('User', userSchema);