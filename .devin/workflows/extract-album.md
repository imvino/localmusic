---
description: Extract Tamil albums from Wikipedia and match with JioSaavn API for any composer
---

# Extract Composer Albums from Wikipedia

This workflow extracts Tamil albums from a Wikipedia composer's discography page and matches them with JioSaavn API data.

## Prerequisites

- Server must be running on `http://localhost:3001`
- `fuse.js` package must be installed (already in package.json)
- Wikipedia URL for the composer's discography page
- Composer's JioSaavn artist page URL
- Composer name (for verification and file naming)

## Trigger Format

```
/extract-album <wikipedia-url> <artist-page-url> <composer-name>
```

**Example:**
```
/extract-album https://en.wikipedia.org/wiki/Harris_Jayaraj_discography http://localhost:5173/discover/artist/455243 "Harris Jayaraj"
```

## Workflow Steps

### 1. Extract Parameters

Parse the trigger parameters:
- **Wikipedia URL**: The discography page URL
- **Artist Page URL**: The JioSaavn artist page URL (e.g., `http://localhost:5173/discover/artist/455243`)
- **Composer Name**: The composer's name (e.g., "Harris Jayaraj")

Extract:
- Artist ID from artist page URL (last segment after `/artist/`)
- Generate safe filename from composer name: `harris-jayaraj` → `harris-jayaraj-wikipedia-albums.json`

### 2. AI Wikipedia Extraction

Use AI to fetch and parse the Wikipedia discography table:

**AI Task:**
Fetch the Wikipedia page and extract Tamil albums from the discography table.

**AI Instructions:**
- Fetch the Wikipedia page content from the provided URL
- Locate the discography section/table
- Extract album names and years from the table
- **Filter for Tamil language only** (exclude Telugu, Hindi, Kannada, Malayalam, etc.)
- Handle complex table structures:
  - Continuation rows (where year spans multiple album rows)
  - Merged cells
  - Multiple table formats
- Extract years from various formats (single year, year ranges, etc.)
- Ignore non-film albums, compilations, singles
- Preserve original spelling (don't normalize yet - needed for fuzzy matching)
- Output format: JSON array of objects with `albumName` and `year` fields

**Output File:** `data/{composer-name}-wikipedia-albums.json`

**Example Output:**
```json
[
  { "albumName": "Minnale", "year": "2001" },
  { "albumName": "Majunu", "year": "2001" },
  { "albumName": "12B", "year": "2001" }
]
```

### 3. API Matching with Script

Run the matching script to find corresponding albums on JioSaavn:

```bash
node scripts/match-composer-albums.js \
  --composer "{composer-name}" \
  --artist-id "{artist-id}" \
  --input data/{composer-name}-wikipedia-albums.json \
  --output data/{composer-name}-albums-metadata.json
```

**Script Implementation Details:**

The script should:
1. Parse command line arguments (--composer, --artist-id, --input, --output)
2. Read the Wikipedia extraction JSON file
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
   - **DO NOT** check year (Wikipedia years are unreliable)
7. Add delay between queries (1-2 seconds) to avoid rate limiting
8. Handle 403 errors with retry logic
9. Save results with found/not found status

**Output Format:**
```json
{
  "artistId": "455243",
  "artistName": "Harris Jayaraj",
  "source": "Wikipedia + JioSaavn API",
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

### 4. Frontend Integration

Copy the metadata JSON to the public folder:

```bash
cp data/{composer-name}-albums-metadata.json client/public/data/{composer-name}-albums-metadata.json
```

Update `client/src/views/DiscoverDetailView.jsx`:

1. Add composer ID constant at the top:
```javascript
const {COMPOSER_CONSTANT_NAME}_ID = '{artist-id}'
```
Example: `const HARRIS_JAYARAJ_ID = '455243'`

2. Add to custom albums loading logic:
```javascript
// Load custom albums for {composer-name}
useEffect(() => {
  if (isArtist && id === {COMPOSER_CONSTANT_NAME}_ID) {
    fetch('/data/{composer-name}-albums-metadata.json')
      .then(res => res.json())
      .then(data => {
        const transformedAlbums = data.albums.map(album => ({
          id: album.id,
          name: album.title,
          year: album.year,
          image: album.image ? [{ quality: '150x150', url: album.image }] : [],
          songCount: 0,
          playCount: 0,
          isLocal: false
        }))
        setCustomAlbums(transformedAlbums)
      })
      .catch(err => {
        console.error('Failed to load custom albums:', err)
      })
  }
}, [isArtist, id])
```

3. Update albums line to use custom albums:
```javascript
const albums = (isArtist && id === {COMPOSER_CONSTANT_NAME}_ID) ? (customAlbums || []) : (data?.topAlbums || [])
```

### 5. Verification & Reporting

After completion, report:
- Total albums extracted from Wikipedia
- Albums successfully matched with JioSaavn
- Albums not found (list them)
- Any errors or warnings encountered

## Key Lessons Learned

**Problems Encountered (and solutions):**

1. **Wikipedia year data unreliable** → Don't use for verification
2. **Wrong album matches** → Use fuzzy matching + API verification
3. **Duplicate IDs** → Proper deduplication in script
4. **Rate limiting** → Add delays between API calls, handle 403 errors
5. **Spelling variations** → Normalize (th→t, aa→a, ii→i, etc.)
6. **Complex tables** → Use AI to parse Wikipedia tables
7. **Language filtering** → Verify language is Tamil in API response
8. **Composer verification** → Check composer field in API response

**Solutions Implemented:**

1. **Fuse.js for fuzzy matching** - Threshold 0.4 for lenient matching
2. **API verification** - Check language, composer, name (not year)
3. **Fallback queries** - Try multiple search terms
4. **Rate limiting handling** - 403 detection and delays
5. **Spelling normalization** - th→t, aa→a, ii→i, etc.
6. **AI extraction** - Use AI for complex Wikipedia table parsing

## Troubleshooting

**Issue: Albums not found**
- Check if the album name spelling matches between Wikipedia and JioSaavn
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

**Issue: Wikipedia table not parsed correctly**
- The AI might need better instructions for the specific table format
- Provide the table structure in the AI prompt
- Manually extract and verify a few entries

## Example Usage

For Harris Jayaraj:
```
/extract-album https://en.wikipedia.org/wiki/Harris_Jayaraj_discography http://localhost:5173/discover/artist/455243 "Harris Jayaraj"
```

For A.R. Rahman:
```
/extract-album https://en.wikipedia.org/wiki/A._R._Rahman_discography http://localhost:5173/discover/artist/455162 "A.R. Rahman"
```

For Yuvan Shankar Raja:
```
/extract-album https://en.wikipedia.org/wiki/Yuvan_Shankar_Raja_discography http://localhost:5173/discover/artist/456091 "Yuvan Shankar Raja"
```
