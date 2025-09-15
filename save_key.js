const mongoose = require('mongoose');
const { APIKey } = require('../models/APIKey');

const saveGeminiKey = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const existingKey = await APIKey.findOne({ provider: 'gemini', isAppKey: true });

    if (existingKey) {
      existingKey.key = 'AIzaSyAFfuh7A6mpHV5nOmfoRxQcV80Ypq07BbQ';
      existingKey.lastUsed = new Date();
      await existingKey.save();
      console.log('Updated existing Gemini app key');
    } else {
      const newKey = new APIKey({
        provider: 'gemini',
        key: 'AIzaSyAFfuh7A6mpHV5nOmfoRxQcV80Ypq07BbQ',
        name: 'Gemini App Key',
        isAppKey: true,
        isActive: true
      });
      await newKey.save();
      console.log('Created new Gemini app key');
    }

    mongoose.connection.close();
  } catch (error) {
    console.error('Error saving key:', error);
  }
};

saveGeminiKey();