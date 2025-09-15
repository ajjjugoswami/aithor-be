const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendVerificationOTP, verifyOTP, sendOTPEmail } = require('../utils/otpService');
const router = express.Router();

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

/**
 * Send password reset email using Brevo
 * @param {string} email - Recipient email
 * @param {string} resetUrl - Password reset URL
 * @returns {Promise<object>} Send result
 */
const sendPasswordResetEmail = async (email, resetUrl) => {
  try {
    const SibApiV3Sdk = require('sib-api-v3-sdk');

    // Configure Brevo API
    const defaultClient = SibApiV3Sdk.ApiClient.instance;
    const apiKey = defaultClient.authentications['api-key'];
    apiKey.apiKey = process.env.BREVO_API_KEY;

    const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.subject = "Password Reset Request - AIthor";
    sendSmtpEmail.htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>AIthor Password Reset</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #2563eb; margin: 0;">AIthor AI</h1>
              <p style="color: #6b7280; margin: 5px 0;">Password Reset</p>
            </div>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 30px;">
              <h2 style="color: #1f2937; margin: 0 0 20px 0; text-align: center;">Reset Your Password</h2>

              <p style="color: #6b7280; margin: 20px 0;">
                You requested a password reset for your AIthor account. Click the button below to reset your password:
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
              </div>

              <p style="color: #6b7280; margin: 20px 0; font-size: 14px;">
                This link will expire in <strong>1 hour</strong> for security reasons.
              </p>

              <p style="color: #6b7280; margin: 20px 0; font-size: 14px;">
                If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
              </p>

              <p style="color: #dc2626; margin: 20px 0; font-size: 14px; font-weight: bold;">
                ⚠️ Never share this email or the reset link with anyone.
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p style="color: #9ca3af; font-size: 14px; margin: 0;">
                This is an automated message from AIthor AI. Please do not reply to this email.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
    sendSmtpEmail.sender = {
      name: process.env.BREVO_FROM_NAME || 'AIthor AI',
      email: process.env.BREVO_FROM_EMAIL || 'aithor060@gmail.com'
    };
    sendSmtpEmail.to = [{ email: email }];
    sendSmtpEmail.replyTo = {
      name: process.env.BREVO_FROM_NAME || 'AIthor AI',
      email: process.env.BREVO_FROM_EMAIL || 'aithor060@gmail.com'
    };

    const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
    return { success: true, messageId: result.messageId };

  } catch (error) {
    console.error('Error sending password reset email:', error);

    let errorMessage = 'Failed to send password reset email';
    if (error.message) {
      if (error.message.includes('api-key')) {
        errorMessage = 'Email service not configured. Please check API key.';
      } else if (error.message.includes('sender')) {
        errorMessage = 'Sender email not verified. Please verify sender email in Brevo dashboard.';
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Password reset email sent
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour

    // Save reset token to user
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    // Send reset email using Brevo
    const resetUrl = `https://chat-with-aithor.vercel.app/reset-password/${resetToken}`;
    const emailResult = await sendPasswordResetEmail(email, resetUrl);

    if (!emailResult.success) {
      return res.status(500).json({ error: emailResult.error || 'Failed to send reset email' });
    }

    res.json({ message: 'Password reset email sent successfully' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired token
 *       500:
 *         description: Server error
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update user password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated id of the user
 *         email:
 *           type: string
 *           format: email
 *           description: User's email address
 *         password:
 *           type: string
 *           description: User's password
 *         name:
 *           type: string
 *           description: User's display name
 *         isAdmin:
 *           type: boolean
 *           description: Whether the user has admin privileges
 *         isVerified:
 *           type: boolean
 *           description: Whether the user's email is verified
 *         picture:
 *           type: string
 *           description: URL to user's profile picture
 *       example:
 *         id: 60d5ecb74b24c72b8c8b4567
 *         email: user@example.com
 *         password: password123
 *         name: John Doe
 *         isAdmin: false
 *         isVerified: true
 *         picture: https://example.com/picture.jpg
 *
 *     AuthResponse:
 *       type: object
 *       properties:
 *         token:
 *           type: string
 *           description: JWT authentication token
 *         user:
 *           $ref: '#/components/schemas/User'
 *       example:
 *         token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *         user:
 *           id: 60d5ecb74b24c72b8c8b4567
 *           email: user@example.com
 *           name: John Doe
 *           isAdmin: false
 *           isVerified: true
 *           picture: https://example.com/picture.jpg
 *
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           description: Error message
 *       example:
 *         error: Invalid credentials
 */

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

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

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 description: User's password
 *               name:
 *                 type: string
 *                 description: User's display name
 *             example:
 *               email: user@example.com
 *               password: password123
 *               name: John Doe
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Bad request - User already exists or invalid data
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
// Signup
router.post('/signup', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user (directly verified)
    const newUser = new User({
      email,
      password: hashedPassword,
      isVerified: true
    });

    await newUser.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, isAdmin: newUser.isAdmin || false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'User created successfully.',
      token,
      user: { id: newUser._id, email: newUser.email, isVerified: newUser.isVerified }
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 description: User's password
 *             example:
 *               email: user@example.com
 *               password: password123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Bad request - Invalid credentials
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
// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, isAdmin: user.isAdmin || false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user._id, email: user.email, isVerified: user.isVerified, isAdmin: user.isAdmin }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify token
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ valid: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);

    // Get user's quota information for free providers
    const { UserQuota } = require('../models/APIKey');
    const openaiQuota = await UserQuota.findOne({ userId: user._id, provider: 'openai' });
    const geminiQuota = await UserQuota.findOne({ userId: user._id, provider: 'gemini' });

    const quotas = {
      openai: openaiQuota ? {
        usedCalls: openaiQuota.usedCalls,
        maxFreeCalls: openaiQuota.maxFreeCalls,
        remainingCalls: Math.max(0, openaiQuota.maxFreeCalls - openaiQuota.usedCalls)
      } : {
        usedCalls: 0,
        maxFreeCalls: 10,
        remainingCalls: 10
      },
      gemini: geminiQuota ? {
        usedCalls: geminiQuota.usedCalls,
        maxFreeCalls: geminiQuota.maxFreeCalls,
        remainingCalls: Math.max(0, geminiQuota.maxFreeCalls - geminiQuota.usedCalls)
      } : {
        usedCalls: 0,
        maxFreeCalls: 10,
        remainingCalls: 10
      }
    };

    res.json({
      valid: true,
      user: {
        id: user._id,
        email: user.email,
        isAdmin: user.isAdmin,
        name: user.name,
        picture: user.picture
      },
      quotas
    });
  } catch (error) {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

// Send OTP for email verification
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if user already exists and is verified
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && existingUser.isVerified) {
      return res.status(400).json({
        error: 'User already exists and is verified. Please sign in instead.'
      });
    }

    const result = await sendVerificationOTP(email);

    if (result.success) {
      res.json({
        message: result.message,
        email: email
      });
    } else {
      res.status(500).json({ error: result.message });
    }
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const result = verifyOTP(email, otp);

    if (result.isValid) {
      res.json({
        message: result.message,
        verified: true
      });
    } else {
      res.status(400).json({
        error: result.message,
        verified: false
      });
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Signup with OTP verification
router.post('/signup-with-otp', async (req, res) => {
  try {
    const { email, password, name, otp } = req.body;

    if (!email || !password || !otp) {
      return res.status(400).json({ error: 'Email, password, and OTP are required' });
    }

    // Verify OTP first
    const otpResult = verifyOTP(email, otp);
    if (!otpResult.isValid) {
      return res.status(400).json({ error: otpResult.message });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      email,
      password: hashedPassword,
      name: name || email.split('@')[0],
      isVerified: true
    });

    await newUser.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email, isAdmin: newUser.isAdmin || false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'User created and verified successfully.',
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name,
        isVerified: newUser.isVerified
      }
    });
  } catch (error) {
    console.error('Signup with OTP error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Google OAuth signup (placeholder for now)
router.post('/google-auth', async (req, res) => {
  try {
    const { credential } = req.body;

    // Decode Google credential (simplified - in production use google-auth-library)
    const payload = JSON.parse(Buffer.from(credential.split('.')[1], 'base64').toString());

    // Check if user exists, if not create
    let user = await User.findOne({ email: payload.email });
    if (!user) {
      user = new User({
        email: payload.email,
        googleId: payload.sub,
        name: payload.name,
        picture: payload.picture,
        isVerified: true
      });
      await user.save();
    } else {
      // Update Google info if user exists but doesn't have Google ID
      if (!user.googleId) {
        user.googleId = payload.sub;
        user.name = payload.name;
        user.picture = payload.picture;
        await user.save();
      }
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email, isAdmin: user.isAdmin || false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user._id, email: user.email, name: user.name, picture: user.picture, isAdmin: user.isAdmin }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
// Grant admin access to a user
router.post('/grant-admin/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find and update user
    const user = await User.findByIdAndUpdate(
      userId,
      { isAdmin: true },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Admin access granted successfully',
      user: { id: user._id, email: user.email, isAdmin: user.isAdmin }
    });
  } catch (error) {
    console.error('Grant admin error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Revoke admin access from a user
router.post('/revoke-admin/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find and update user
    const user = await User.findByIdAndUpdate(
      userId,
      { isAdmin: false },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Admin access revoked successfully',
      user: { id: user._id, email: user.email, isAdmin: user.isAdmin }
    });
  } catch (error) {
    console.error('Revoke admin error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Change password endpoint
/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: Current password
 *               newPassword:
 *                 type: string
 *                 description: New password (minimum 6 characters)
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid input or current password incorrect
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: 'New password must be at least 6 characters long'
      });
    }

    // Find user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Check if new password is different from current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({
        error: 'New password must be different from current password'
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    user.password = hashedNewPassword;
    await user.save();

    res.json({
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (admin only)
router.delete('/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from deleting themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Find and delete the user
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      message: 'User deleted successfully',
      user: { id: user._id, email: user.email, name: user.name }
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;