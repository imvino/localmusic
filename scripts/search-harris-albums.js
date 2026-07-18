const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Fuse = require('fuse.js');

// Helper function to fetch from JioSaavn API
async function fetchFromMusicServiceOfficial(__call, params = {}) {
  try {
    const allParams = {
      __call,
      _format: 'json',
      _marker: 0,
      api_version: 4,
      ctx: 'web6dot0',
      ...params
    };
    console.log(`Fetching: ${__call} for query: ${params.q}`);
    const response = await axios.get('https://www.jiosaavn.com/api.php', {
      params: allParams,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return response.data;
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log(`  Rate limited (403) for query: ${params.q}`);
    } else {
      console.error(`Error fetching from music service: ${error.message}`);
    }
    return null;
  }
}

// Helper to get best image
function getBestImage(imageObj) {
  if (typeof imageObj === 'string') return imageObj;
  if (!imageObj || !Array.isArray(imageObj)) return null;
  const best = imageObj.find(img => img.quality === '500x500') || 
               imageObj.find(img => img.quality === '150x150') || 
               imageObj[imageObj.length - 1];
  return best ? best.url : null;
}

// Fuzzy match function for album names using fuse.js
function fuzzyMatchAlbumName(searchName, apiName) {
  const searchLower = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const apiLower = apiName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Exact match
  if (searchLower === apiLower) return true;
  
  // Check if API name contains search name (or vice versa)
  if (searchLower.includes(apiLower) || apiLower.includes(searchLower)) return true;
  
  // Normalize common Tamil/English spelling variations
  const normalizeSpelling = (str) => {
    return str
      .replace(/th/g, 't')  // Sathyam -> Satyam
      .replace(/aa/g, 'a')   // Various double vowels
      .replace(/ii/g, 'i')
      .replace(/ee/g, 'e')
      .replace(/oo/g, 'o');
  };
  
  const normalizedSearch = normalizeSpelling(searchLower);
  const normalizedApi = normalizeSpelling(apiLower);
  
  if (normalizedSearch === normalizedApi) return true;
  if (normalizedSearch.includes(normalizedApi) || normalizedApi.includes(normalizedSearch)) return true;
  
  // Use fuse.js for fuzzy matching
  const fuse = new Fuse([apiName], {
    includeScore: true,
    threshold: 0.4, // More lenient for longer names
    ignoreLocation: true,
    useExtendedSearch: false
  });
  
  const result = fuse.search(searchName);
  return result.length > 0;
}

// Verify album by checking language, composer, and name
async function verifyAlbum(albumId, expectedTitle) {
  try {
    const response = await axios.get(`http://localhost:3001/api/album/${albumId}`);
    const albumData = response.data;
    
    if (!albumData.success || !albumData.data) {
      console.log(`  ✗ Album ${albumId} API call failed`);
      return false;
    }
    
    const data = albumData.data;
    
    // Check language (should be Tamil)
    const language = (data.language || '').toLowerCase();
    if (!language.includes('tamil')) {
      console.log(`  ✗ Album ${albumId} language is not Tamil: ${language}`);
      return false;
    }
    
    // Check composer (should include Harris Jayaraj)
    const composers = data.composers || [];
    const hasHarris = composers.some(c => 
      c && (c.name || c).toLowerCase().includes('harris')
    );
    if (!hasHarris) {
      console.log(`  ✗ Album ${albumId} composer does not include Harris Jayaraj`);
      return false;
    }
    
    // Check name with fuzzy match
    const apiName = data.name || '';
    if (!fuzzyMatchAlbumName(expectedTitle, apiName)) {
      console.log(`  ✗ Album ${albumId} name mismatch: expected "${expectedTitle}", got "${apiName}"`);
      return false;
    }
    
    console.log(`  ✓ Album ${albumId} verified: ${apiName} (${data.year})`);
    return true;
  } catch (error) {
    console.log(`  ✗ Album ${albumId} verification error: ${error.message}`);
    return false;
  }
}

// Main async function
async function main() {
  // Read the Wikipedia album list
  const wikipediaAlbumsPath = path.join(__dirname, '../data/harris-jayaraj-tamil-albums.json');
  const wikipediaData = JSON.parse(fs.readFileSync(wikipediaAlbumsPath, 'utf8'));

  console.log(`Processing ${wikipediaData.albums.length} albums from Wikipedia...`);

  // Process each album
  const albumsWithMetadata = [];
  let foundCount = 0;
  let notFoundCount = 0;

  for (const album of wikipediaData.albums) {
    let albumMetadata = {
      title: album.title,
      year: album.year,
      language: album.language,
      id: null,
      image: null,
      found: false
    };

    // Try multiple search queries with fallback
    const searchQueries = [
      `${album.title} harris jayaraj tamil`,
      `${album.title} harris jayaraj`,
      album.title
    ];

    let verifiedMatch = null;
    let usedQuery = null;

    for (const searchQuery of searchQueries) {
      console.log(`\nSearching for: ${searchQuery}`);
      
      // Search for album
      const searchResults = await fetchFromMusicServiceOfficial('search.getAlbumResults', {
        q: searchQuery,
        p: 1,
        n: 10
      });
      
      if (searchResults && searchResults.results) {
        const results = Object.values(searchResults.results);
        
        // Try each result and verify it
        for (const result of results) {
          if (result.id) {
            const isVerified = await verifyAlbum(result.id, album.title);
            if (isVerified) {
              verifiedMatch = result;
              usedQuery = searchQuery;
              break;
            }
          }
        }
        
        if (verifiedMatch) break;
      }
      
      // Add delay between fallback queries to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (verifiedMatch) {
      albumMetadata.id = verifiedMatch.id || null;
      albumMetadata.image = getBestImage(verifiedMatch.image);
      albumMetadata.found = true;
      foundCount++;
      console.log(`✓ Found and verified: ${album.title} (ID: ${albumMetadata.id}) using query: "${usedQuery}"`);
    } else {
      notFoundCount++;
      console.log(`✗ No verified match found for: ${album.title} (tried all fallback queries)`);
    }
    
    albumsWithMetadata.push(albumMetadata);
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Create final metadata structure
  const metadata = {
    artistId: "455243",
    artistName: "Harris Jayaraj",
    source: "Wikipedia + JioSaavn API",
    extractedAt: new Date().toISOString(),
    totalAlbums: albumsWithMetadata.length,
    foundAlbums: foundCount,
    notFoundAlbums: notFoundCount,
    albums: albumsWithMetadata
  };

  // Save to JSON file
  const outputPath = path.join(__dirname, '../data/harris-jayaraj-albums-metadata.json');
  fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2), 'utf8');

  console.log(`\n=== Summary ===`);
  console.log(`Total albums: ${metadata.totalAlbums}`);
  console.log(`Found: ${metadata.foundAlbums}`);
  console.log(`Not found: ${metadata.notFoundAlbums}`);
  console.log(`Saved to: ${outputPath}`);
}

// Run the main function
main().catch(console.error);
