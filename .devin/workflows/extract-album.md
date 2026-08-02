---
description: Match Tamil albums with JioSaavn API for any composer using provided album list
---

# Match Composer Albums with JioSaavn API

This workflow matches a provided list of Tamil albums with JioSaavn API data for any composer.

## Prerequisites

- Server must be running on `http://localhost:3001`
- `fuse.js` package must be installed (already in package.json)
- Album list in JSON format (with title and year fields)
- Composer's JioSaavn artist page URL
- Composer name (for verification and file naming)

## Trigger Format

```
/extract-album <album-list-json> <artist-page-url> <composer-name>
```

**Example:**
```
/extract-album '{"total_count":53,"artist":"Harris Jayaraj","tamil_albums":[{"year":2001,"title":"Minnale"},{"year":2001,"title":"Majunu"}]}' http://localhost:5173/discover/artist/455243 "Harris Jayaraj"
```

**Album List Format:**
```json
{
  "total_count": 53,
  "artist": "Harris Jayaraj",
  "tamil_albums": [
    { "year": 2001, "title": "Minnale" },
    { "year": 2001, "title": "Majunu" },
    { "year": 2001, "title": "12B" }
  ]
}
```

## Workflow Steps

### 1. Extract Parameters

Parse the trigger parameters:
- **Album List JSON**: The JSON string containing album data with `tamil_albums` array
- **Artist Page URL**: The JioSaavn artist page URL (e.g., `http://localhost:5173/discover/artist/455243`)
- **Composer Name**: The composer's name (e.g., "Harris Jayaraj")

Extract:
- Artist ID from artist page URL (last segment after `/artist/`)
- Parse the album list JSON to get the `tamil_albums` array
- Generate safe filename from composer name: `harris-jayaraj` → `harris-jayaraj-albums.json`

### 2. Save Album List

Save the provided album list to a JSON file for processing:

**Input Format:**
```json
{
  "total_count": 53,
  "artist": "Harris Jayaraj",
  "tamil_albums": [
    { "year": 2001, "title": "Minnale" },
    { "year": 2001, "title": "Majunu" },
    { "year": 2001, "title": "12B" }
  ]
}
```

**Transform to Script Format:**
Convert the album list to the format expected by the matching script:
```json
[
  { "albumName": "Minnale", "year": "2001" },
  { "albumName": "Majunu", "year": "2001" },
  { "albumName": "12B", "year": "2001" }
]
```

**Output File:** `data/temp/{composer-name}-albums.json`

### 3. API Matching with Script

Run the matching script to find corresponding albums on JioSaavn:

```bash
node scripts/match-composer-albums.js \
  --composer "{composer-name}" \
  --artist-id "{artist-id}" \
  --input data/temp/{composer-name}-albums.json \
  --output data/meta/{composer-name}-albums-metadata.json
```

**Script Implementation Details:**

The script should:
1. Parse command line arguments (--composer, --artist-id, --input, --output)
2. Read the album list JSON file
3. For each album, try multiple search queries with fallback:
   - `"{albumName} {composer} tamil"`
   - `"{albumName} {composer}"`
   - `"{albumName}"`
4. Use fuse.js for fuzzy name matching (threshold: 0.4)
5. Normalize spelling variations:
   - `th` → `t` (Sathyam → Satyam)
   - `aa` → `a` (various double vowels)
   - `ii` → `i`
   - `ee` → `e`
   - `oo` → `o`
6. Verify each match by calling `/api/album/{id}`:
   - Check language is Tamil
   - Check composer includes the specified composer
   - Check name fuzzy matches
   - **DO NOT** check year (provided years may be unreliable)
7. Add delay between queries (1-2 seconds) to avoid rate limiting
8. Handle 403 errors with retry logic
9. Save results with found/not found status

**Output Format:**
```json
{
  "artistId": "455243",
  "artistName": "Harris Jayaraj",
  "source": "Provided list + JioSaavn API",
  "extractedAt": "2026-07-19T...",
  "totalAlbums": 45,
  "foundAlbums": 41,
  "notFoundAlbums": 4,
  "albums": [
    {
      "title": "Minnale",
      "year": 2001,
      "language": "Tamil",
      "id": "26737446",
      "image": "https://...",
      "found": true
    }
  ]
}
```

### 4. Backend Configuration

Update `config/artist-config.json` to register the new composer:

```json
{
  "customAlbums": {
    "{artist-id}": {
      "name": "{composer-name}",
      "metadataFile": "{composer-name}-albums-metadata.json"
    }
  }
}
```

**Example:**
```json
{
  "customAlbums": {
    "455243": {
      "name": "Harris Jayaraj",
      "metadataFile": "harris-jayaraj-albums-metadata.json"
    }
  }
}
```

The frontend automatically fetches metadata from `/api/composer-albums/:composerId` - no frontend code changes needed.

### 4. Verification & Reporting

After completion, report:
- Total albums from provided list
- Albums successfully matched with JioSaavn
- Albums not found (list them)
- Any errors or warnings encountered

## Key Lessons Learned

**Problems Encountered (and solutions):**

1. **Provided year data unreliable** → Don't use for verification
2. **Wrong album matches** → Use fuzzy matching + API verification
3. **Duplicate IDs** → Proper deduplication in script
4. **Rate limiting** → Add delays between API calls, handle 403 errors
5. **Spelling variations** → Normalize (th→t, aa→a, ii→i, etc.)
6. **Language filtering** → Verify language is Tamil in API response
7. **Composer verification** → Check composer field in API response

**Solutions Implemented:**

1. **Fuse.js for fuzzy matching** - Threshold 0.4 for lenient matching
2. **API verification** - Check language, composer, name (not year)
3. **Fallback queries** - Try multiple search terms
4. **Rate limiting handling** - 403 detection and delays
5. **Spelling normalization** - th→t, aa→a, ii→i, etc.

## Troubleshooting

**Issue: Albums not found**
- Check if the album name spelling matches between provided list and JioSaavn
- Try manual search on JioSaavn to see if the album exists
- The album might be listed under a different name or compilation

**Issue: Wrong album matched**
- The fuzzy matching threshold might be too lenient
- Check the API verification logs
- Manually verify the album details

**Issue: Rate limiting (403 errors)**
- Increase delay between queries
- The script should handle 403 errors automatically
- Wait a few minutes and retry

**Issue: Invalid JSON format**
- Ensure the album list JSON is properly formatted
- Check that `tamil_albums` array exists and contains objects with `title` and `year` fields
- Validate JSON structure before running the script

## Example Usage

For Harris Jayaraj:
```
/extract-album '{"total_count":53,"artist":"Harris Jayaraj","tamil_albums":[{"year":2001,"title":"Minnale"},{"year":2001,"title":"Majunu"}]}' http://localhost:5173/discover/artist/455243 "Harris Jayaraj"
```

For A.R. Rahman:
```
/extract-album '{"total_count":100,"artist":"A.R. Rahman","tamil_albums":[{"year":1992,"title":"Roja"},{"year":1993,"title":"Kadal"}]}' http://localhost:5173/discover/artist/455162 "A.R. Rahman"
```

For Yuvan Shankar Raja:
```
/extract-album '{"total_count":80,"artist":"Yuvan Shankar Raja","tamil_albums":[{"year":2002,"title":"Thulluvadho Ilamai"},{"year":2003,"title":"Pudhupettai"}]}' http://localhost:5173/discover/artist/456091 "Yuvan Shankar Raja"
```
