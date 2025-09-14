# aithor-be

Backend API for Aithor chat application with AI integration.

## API Documentation

This API is documented using Swagger/OpenAPI 3.0 specification.

### Accessing API Documentation

Once the server is running, you can access the interactive API documentation at:

- **Swagger UI**: `http://localhost:8000/api-docs` (or your production URL)
- **OpenAPI JSON**: `http://localhost:8000/swagger.json`

### Authentication

Most endpoints require authentication using JWT tokens. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### Key Features

- User authentication and authorization
- API key management for multiple AI providers
- Admin panel for user management
- Server-side filtering for users by name and email

## Migration: APIKey indexes

If you were previously prevented from saving multiple API keys per provider, your MongoDB may have an index that enforces uniqueness on `(userId, provider)`.

### Automated Migration (Recommended)

Run the automated migration script:

```bash
cd aithor-be
node migrate-indexes.js
```

This script will:
- Connect to your MongoDB database
- Check for the old unique index on `{userId, provider}`
- Drop it if it exists
- Create the correct indexes:
  - Non-unique index on `{userId, provider}` for query performance
  - Unique index on `{userId, key}` to prevent duplicate key values

### Manual Migration

If you prefer to run the commands manually in a mongo shell or using `mongosh`:

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
