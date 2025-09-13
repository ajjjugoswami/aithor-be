const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Create transporter for sending emails
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: "goswaiajay526@gmail.com",
    pass: "dodzqgyfytiyppna"
  },
  debug: true, // Enable debug output
  logger: true // Log to console
});

// Generate a 6-digit OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Send OTP email
async function sendOTPEmail(email, otp) {
  console.log(`OTP for ${email}: ${otp}`); // Always log for debugging

  if (!"goswaiajay526@gmail.com" || !"dodzqgyfytiyppna") {
    console.log(`OTP for ${email}: ${otp} (Email not configured - check EMAIL_USER and EMAIL_PASS environment variables)`);
    return { success: false, message: 'Email not configured' };
  }

  const mailOptions = {
    from: "goswaiajay526@gmail.com",
    to: email,
    subject: 'Your OTP for Aithor Verification',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verify Your Email</h2>
        <p>Your One-Time Password (OTP) for Aithor is:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px;">
          ${otp}
        </div>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `
  };

  try {
    const result = await transporter.sendMail(mailOptions);
    console.log(`OTP email sent successfully to ${email}`);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error(`Error sending OTP email to ${email}:`, error.message);
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
}

module.exports = {
  generateOTP,
  sendOTPEmail
};