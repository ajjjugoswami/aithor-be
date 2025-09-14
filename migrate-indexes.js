const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/aithor');
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Migration function
const migrateIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    const collection = db.collection('apikeys');

    console.log('Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(index => {
      console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
    });

    // Check for the old unique index on { userId: 1, provider: 1 }
    const oldIndex = indexes.find(index =>
      index.key && index.key.userId === 1 && index.key.provider === 1 && index.unique === true
    );

    if (oldIndex) {
      console.log(`\nFound old unique index: ${oldIndex.name}`);
      console.log('Dropping old unique index...');
      await collection.dropIndex(oldIndex.name);
      console.log('✅ Old unique index dropped successfully');
    } else {
      console.log('\nNo old unique index found on {userId, provider}');
    }

    // Ensure we have the correct indexes
    console.log('\nEnsuring correct indexes...');

    // Create non-unique index on {userId, provider} for performance
    try {
      await collection.createIndex({ userId: 1, provider: 1 });
      console.log('✅ Created non-unique index on {userId, provider}');
    } catch (error) {
      if (error.code === 85) {
        console.log('ℹ️  Non-unique index on {userId, provider} already exists');
      } else {
        throw error;
      }
    }

    // Create unique index on {userId, key} to prevent duplicate key values
    try {
      await collection.createIndex({ userId: 1, key: 1 }, { unique: true });
      console.log('✅ Created unique index on {userId, key}');
    } catch (error) {
      if (error.code === 85) {
        console.log('ℹ️  Unique index on {userId, key} already exists');
      } else {
        throw error;
      }
    }

    console.log('\nFinal indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach(index => {
      console.log(`- ${index.name}: ${JSON.stringify(index.key)} ${index.unique ? '(unique)' : ''}`);
    });

    console.log('\n🎉 Migration completed successfully!');
    console.log('You can now save multiple API keys per provider for each user.');

  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  }
};

// Run migration
const runMigration = async () => {
  await connectDB();
  await migrateIndexes();
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB');
};

runMigration();