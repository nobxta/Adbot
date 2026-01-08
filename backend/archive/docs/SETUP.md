# Backend JSON Storage Setup

This backend folder stores bot configuration data in JSON files for quick access by Python/Telethon scripts.

## Structure

```
backend/
├── data/
│   ├── users.json          # Bot configurations (tokens, API, sessions, post links)
│   └── groups.json          # Group IDs and configurations
├── lib/
│   ├── storage.ts           # User bot config management (TypeScript)
│   └── groups.ts            # Group management (TypeScript)
├── python_example.py        # Example Python script to read JSON files
└── README.md                # Documentation
```

## Data Storage

### users.json
Stores per-user bot configuration:
```json
{
  "users": {
    "user-id": {
      "userId": "user-id",
      "email": "user@example.com",
      "botToken": "1234567890:ABC...",
      "apiId": "12345678",
      "apiHash": "abcdef1234567890...",
      "sessionString": "telethon_session_string",
      "postLink": "https://t.me/channel/123",
      "customText": null,
      "advertisementType": "link",
      "groupIds": ["-1001234567890"],
      "botStatus": "active",
      "lastUpdated": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### groups.json
Stores group information:
```json
{
  "groups": {
    "-1001234567890": {
      "groupId": "-1001234567890",
      "groupName": "Example Group",
      "groupType": "telegram",
      "userId": "user-id",
      "addedAt": "2024-01-01T00:00:00.000Z",
      "isActive": true
    }
  }
}
```

## API Endpoints

### GET `/api/user/advertisement?userId=xxx`
Fetches advertisement configuration from JSON file.

### POST `/api/user/advertisement`
Saves advertisement configuration to JSON file.

### GET `/api/bot/config?userId=xxx`
Fetches full bot configuration (tokens, API credentials, sessions).

### POST `/api/bot/config`
Saves bot configuration (tokens, API credentials, sessions).

## Python/Telethon Usage

See `python_example.py` for example code on how to read these JSON files in Python.

```python
import json

# Read user config
with open('backend/data/users.json', 'r') as f:
    data = json.load(f)
    user_config = data['users'][user_id]
    
    bot_token = user_config['botToken']
    api_id = user_config['apiId']
    api_hash = user_config['apiHash']
    session_string = user_config['sessionString']
    post_link = user_config['postLink']
    group_ids = user_config['groupIds']
```

## Security

⚠️ **Important**: These JSON files contain sensitive data:
- Bot tokens
- API credentials
- Session strings
- Group IDs

**Never commit these files to version control!**

The `.gitignore` file is configured to exclude `data/*.json` files.

## Initialization

1. The `data/` directory is created automatically
2. Empty JSON files are initialized with proper structure
3. Example files (`.example.json`) are provided as templates

