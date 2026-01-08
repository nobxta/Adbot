# API Pairs Format Guide

## How It Works

The system accepts API pairs in **any format** you provide, but automatically converts them to a **standardized JSON format** for storage.

## Input Formats Accepted

You can upload API pairs in any of these formats:

### 1. JSON Array Format
```json
[
  {"api_id": "12345678", "api_hash": "abcdef1234567890abcdef1234567890"},
  {"api_id": "87654321", "api_hash": "fedcba0987654321fedcba0987654321"}
]
```

### 2. JSON Object with "pairs" Key
```json
{
  "pairs": [
    {"api_id": "12345678", "api_hash": "abcdef1234567890abcdef1234567890"},
    {"api_id": "87654321", "api_hash": "fedcba0987654321fedcba0987654321"}
  ]
}
```

### 3. CSV with Headers
```csv
api_id,api_hash
12345678,abcdef1234567890abcdef1234567890
87654321,fedcba0987654321fedcba0987654321
```

### 4. CSV without Headers
```csv
12345678,abcdef1234567890abcdef1234567890
87654321,fedcba0987654321fedcba0987654321
```

### 5. Space/Tab Separated
```
12345678 abcdef1234567890abcdef1234567890
87654321 fedcba0987654321fedcba0987654321
```

### 6. Comma Separated (No Headers)
```
12345678,abcdef1234567890abcdef1234567890
87654321,fedcba0987654321fedcba0987654321
```

## Storage Format (What Gets Saved)

**All formats are converted to this standard format:**

**File:** `backend/data/api_pairs.json`

```json
{
  "pairs": [
    {
      "api_id": "12345678",
      "api_hash": "abcdef1234567890abcdef1234567890"
    },
    {
      "api_id": "87654321",
      "api_hash": "fedcba0987654321fedcba0987654321"
    }
  ]
}
```

## Validation Rules

1. **api_id**: Must be numeric only (digits 0-9)
2. **api_hash**: Must be hexadecimal (0-9, a-f, A-F)
3. **No duplicates**: Each `api_id` can only exist once

## Why Some Uploads Fail

### Common Failure Reasons:

1. **Duplicate API ID** (Most Common)
   - Error: `"API pair with api_id 12345678 already exists"`
   - **Solution**: Remove duplicates from your upload file, or skip pairs that already exist

2. **Invalid Format**
   - `api_id` contains non-numeric characters
   - `api_hash` contains invalid characters (not hex)
   - **Solution**: Check your data format

3. **Empty Values**
   - Missing `api_id` or `api_hash`
   - **Solution**: Ensure all pairs have both values

## How to Check Existing Pairs

1. View in the Stock Management page
2. Or check the file: `backend/data/api_pairs.json`
3. Or use the API: `GET /api/admin/api-pairs/list`

## Example: Converting Your Format

**Your Input (any format):**
```
12345678 abcdef1234567890abcdef1234567890
87654321 fedcba0987654321fedcba0987654321
```

**Gets Saved As:**
```json
{
  "pairs": [
    {
      "api_id": "12345678",
      "api_hash": "abcdef1234567890abcdef1234567890"
    },
    {
      "api_id": "87654321",
      "api_hash": "fedcba0987654321fedcba0987654321"
    }
  ]
}
```

## Usage in Backend

When the bot system needs to use an API pair, it reads from `backend/data/api_pairs.json` and uses the standardized format. Each pair can handle up to 7 sessions.

