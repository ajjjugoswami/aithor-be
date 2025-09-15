const mongoose = require('mongoose');
const User = require('../models/User');

const makeAdmin = async (email) => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      { isAdmin: true },
      { new: true }
    );

    if (user) {
      console.log('User made admin:', user.email);
    } else {
      console.log('User not found');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
};

// Replace with your email
makeAdmin('your-email@example.com');