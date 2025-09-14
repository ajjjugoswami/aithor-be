# aithor-be

## Migration: APIKey indexes

If you were previously prevented from saving multiple API keys per provider, your MongoDB may have an index that enforces uniqueness on `(userId, provider)`.

To drop the old index and create the recommended indexes run the following in a mongo shell or using `mongosh` connected to your database:

```js
// Connect to your DB then run:
// List indexes for the collection
db.apikeys.getIndexes();

// If you see an index on { userId: 1, provider: 1 } that is unique, drop it (use the actual index name):
db.apikeys.dropIndex('userId_1_provider_1');

// Create non-unique index for queries by provider
db.apikeys.createIndex({ userId: 1, provider: 1 });

// Create unique index to prevent duplicate raw key values per user
db.apikeys.createIndex({ userId: 1, key: 1 }, { unique: true });
```

If you use a managed MongoDB (Atlas), you can run these commands in the Data Explorer > Collections > Indexes UI.
