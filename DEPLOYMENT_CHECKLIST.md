# Vercel Edge Deployment Checklist

## Pre-Deployment Verification ✅

### Code Quality
- [x] Edge Functions have valid syntax
  - `client/api/search.js` ✅
  - `client/api/artist/[id].js` ✅

- [x] Client build succeeds
  - Build output: 463.80 KB (gzip: 132.7 KB) ✅
  - No build errors ✅

### Configuration
- [x] Environment variables set correctly
  - `VITE_VERCEL_API_URL=https://torsongs.vercel.app` ✅
  - `VITE_API_URL=http://localhost:3001/api` ✅

- [x] Vercel configuration correct
  - `client/vercel.json` properly configured ✅
  - Backend endpoints routed to Render ✅
  - SPA routes configured ✅
  - No conflicts with Edge Functions ✅

- [x] Client-side routing logic correct
  - `useApi.js` routes `/search` and `/artist` to Vercel ✅
  - Fallback to backend for other endpoints ✅

- [x] Edge Functions have CORS headers
  - `search.js` has CORS headers ✅
  - `artist/[id].js` has CORS headers ✅

## Deployment Steps

### 1. Deploy to Vercel
```bash
# From project root
vercel deploy --prod
```

### 2. Verify Edge Functions
After deployment, test these endpoints:

**Search Endpoint**
```bash
curl "https://torsongs.vercel.app/api/search?q=anirudh"
```
Expected: 200 OK with songs, albums, artists, playlists

**Artist Endpoint**
```bash
curl "https://torsongs.vercel.app/api/artist/455243"
```
Expected: 200 OK with artist details

**Album Endpoint (Backend)**
```bash
curl "https://torsongs.vercel.app/api/album/[id]"
```
Expected: 200 OK (routed to Render backend)

### 3. Test in Browser
1. Navigate to: `https://torsongs.vercel.app/discover/artist/455243`
2. Verify artist details load
3. Search for a song using the search bar
4. Verify search results appear

## Endpoint Routing Summary

### Vercel Edge Functions (2 endpoints)
- `GET /api/search?q=query` → `client/api/search.js`
- `GET /api/artist/:id` → `client/api/artist/[id].js`

### Render Backend (10 endpoints)
- `/api/album/:id`
- `/api/song/:id`
- `/api/stream/:id`
- `/api/playlist/:id`
- `/api/download-song`
- `/api/download-album`
- `/api/download-progress/:id`
- `/api/scan`
- `/api/composer-albums/:id`
- `/api/health`
- `/api/jio/*`
- `/api/trending-youtube`

### Client-Side Routes (SPA)
- `/discover/:path*`
- `/search`
- `/terms`
- `/privacy`
- `/dmca`

## Notes

- Edge Functions provide geolocation-based optimization for search and artist endpoints
- All other endpoints continue to use the Render backend
- CORS is properly configured for cross-origin requests
- The setup allows for gradual migration of endpoints to Edge Functions
