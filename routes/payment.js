const express = require('express');
const Razorpay = require('razorpay');
const router = express.Router();
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const QRCode = require('qrcode');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * @swagger
 * /api/payment/create-order:
 *   post:
 *     summary: Create a Razorpay order
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - currency
 *             properties:
 *               amount: { type: number, description: "Amount in paisa (1 INR = 100 paisa)" }
 *               currency: { type: string, default: "INR" }
 *               receipt: { type: string, description: "Receipt ID" }
 *     responses:
 *       200:
 *         description: Order created successfully
 *       500:
 *         description: Server error
 */
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;

    const options = {
      amount: amount, // amount in paisa
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/payment/verify:
 *   post:
 *     summary: Verify Razorpay payment
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *               - razorpay_payment_id
 *               - razorpay_signature
 *             properties:
 *               razorpay_order_id: { type: string }
 *               razorpay_payment_id: { type: string }
 *               razorpay_signature: { type: string }
 *     responses:
 *       200:
 *         description: Payment verified successfully
 *       400:
 *         description: Payment verification failed
 *       500:
 *         description: Server error
 */
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify payment signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = require('crypto')
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature === expectedSign) {
      // Payment verified successfully
      res.json({
        success: true,
        message: 'Payment verified successfully',
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification error',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/payment/create-qr:
 *   post:
 *     summary: Create a Razorpay QR code for payment
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - currency
 *             properties:
 *               amount: { type: number, description: "Amount in paisa (1 INR = 100 paisa)" }
 *               currency: { type: string, default: "INR" }
 *               description: { type: string, description: "Payment description" }
 *     responses:
 *       200:
 *         description: QR code created successfully
 *       500:
 *         description: Server error
 */
router.post('/create-qr', async (req, res) => {
  try {
    const { amount, currency = 'INR', description = 'Account Upgrade' } = req.body;

    // Get user from auth middleware or use guest
    const userId = req.user?.id || 'guest';

    // Convert amount from paisa to rupees for UPI
    const amountInRupees = (amount / 100).toFixed(2);

    // Create UPI payment string
    // Format: upi://pay?pa=merchant@upi&pn=MerchantName&am=Amount&cu=CURRENCY&tn=Description
    const upiString = `upi://pay?pa=7082072347@ptsbi&pn=AI%20Thor&am=${amountInRupees}&cu=${currency}&tn=${encodeURIComponent(description)}&tr=${userId}_${Date.now()}`;

    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(upiString, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Generate unique QR ID
    const qrId = `qr_${userId}_${Date.now()}`;

    res.json({
      success: true,
      qr: {
        id: qrId,
        image_url: qrCodeDataURL,
        status: 'active',
        type: 'upi_qr',
        usage: 'single_use',
        customer_id: userId,
        payment_amount: amount,
        close_by: Math.floor(Date.now() / 1000) + 3600
      },
      qr_string: qrCodeDataURL,
      qr_id: qrId,
      upi_string: upiString
    });
  } catch (error) {
    console.error('Error creating QR code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create QR code',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/payment/webhook:
 *   post:
 *     summary: Handle Razorpay webhooks for payment verification
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event: { type: string }
 *               payment: { type: object }
 *               qr_code: { type: object }
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       500:
 *         description: Server error
 */
router.post('/webhook', async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'your_webhook_secret';
    const signature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    const expectedSignature = require('crypto')
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;

    if (event === 'payment.captured') {
      // Payment was successful - upgrade user account
      const payment = req.body.payload.payment.entity;
      console.log('Payment captured:', payment.id);

      try {
        // Find user by customer_id from payment entity
        const customerId = payment.customer_id || payment.notes?.customer_id;

        if (customerId && customerId !== 'guest') {
          const user = await User.findById(customerId);
          if (user) {
            // Upgrade user to premium for 30 days
            user.isPremium = true;
            user.premiumExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
            await user.save();

            console.log(`User ${user.email} upgraded to premium`);

            // TODO: Send confirmation email
          }
        }
      } catch (error) {
        console.error('Error upgrading user:', error);
      }

    } else if (event === 'qr_code.activated') {
      console.log('QR code activated');
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;