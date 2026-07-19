const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Fuse = require('fuse.js');
const { fetchFromMusicServiceOfficial, getBestImage, fuzzyMatchAlbumName } = require('../src/utils');

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
