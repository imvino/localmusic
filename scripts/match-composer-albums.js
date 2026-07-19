const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');
const { fetchFromMusicServiceOfficial, getBestImage, fuzzyMatchAlbumName } = require('../src/utils');

// Parse command line arguments (handle both --arg=value and --arg value formats)
const args = process.argv.slice(2);
const getArg = (name) => {
  // Try --arg=value format first
  const withEquals = args.find(a => a.startsWith(`--${name}=`));
  if (withEquals) return withEquals.split('=')[1];
  
  // Try --arg value format
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  
  return null;
};

const composer = getArg('composer');
const artistId = getArg('artist-id');
const inputFile = getArg('input');
const outputFile = getArg('output');

if (!composer || !artistId || !inputFile || !outputFile) {
  console.error('Missing required arguments');
  console.error('Usage: node match-composer-albums.js --composer "<name>" --artist-id "<id>" --input <file> --output <file>');
  process.exit(1);
}

const API_BASE = 'http://localhost:3001/api';

// Verify album by checking language, composer, and name
async function verifyAlbum(albumId, expectedTitle) {
  try {
    const response = await axios.get(`${API_BASE}/album/${albumId}`);
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
    
    // Check composer (should include the specified composer)
    const composers = data.composers || [];
    const hasComposer = composers.some(c => 
      c && (c.name || c).toLowerCase().includes(composer.toLowerCase())
    );
    if (!hasComposer) {
      console.log(`  ✗ Album ${albumId} composer does not include ${composer}`);
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

async function main() {
  console.log(`Matching albums for ${composer} (Artist ID: ${artistId})`);
  console.log(`Input: ${inputFile}`);
  console.log(`Output: ${outputFile}\n`);
  
  // Read Wikipedia extraction file
  const wikipediaData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  console.log(`Processing ${wikipediaData.length} albums from Wikipedia...\n`);
  
  const albumsWithMetadata = [];
  let foundCount = 0;
  let notFoundCount = 0;
  
  for (const album of wikipediaData) {
    const albumName = album.albumName || album.name;
    const year = album.year;
    
    // Try multiple search queries with fallback
    const searchQueries = [
      `${albumName} ${composer} tamil`,
      `${albumName} ${composer}`,
      albumName
    ];
    
    let verifiedMatch = null;
    let usedQuery = null;
    
    for (const searchQuery of searchQueries) {
      console.log(`Searching for: ${searchQuery}`);
      
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
            const isVerified = await verifyAlbum(result.id, albumName);
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
    
    let albumMetadata = {
      title: albumName,
      year: parseInt(year) || year,
      language: "Tamil",
      id: null,
      image: null,
      found: false
    };
    
    if (verifiedMatch) {
      albumMetadata.id = verifiedMatch.id || null;
      albumMetadata.image = getBestImage(verifiedMatch.image);
      albumMetadata.found = true;
      foundCount++;
      console.log(`✓ Found and verified: ${albumName} (ID: ${albumMetadata.id}) using query: "${usedQuery}"`);
    } else {
      notFoundCount++;
      console.log(`✗ No verified match found for: ${albumName} (tried all fallback queries)`);
    }
    
    albumsWithMetadata.push(albumMetadata);
    
    // Add delay between albums to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Create final metadata structure
  const metadata = {
    artistId: artistId,
    artistName: composer,
    source: "Wikipedia + JioSaavn API",
    extractedAt: new Date().toISOString(),
    totalAlbums: albumsWithMetadata.length,
    foundAlbums: foundCount,
    notFoundAlbums: notFoundCount,
    albums: albumsWithMetadata
  };
  
  // Save to JSON file
  fs.writeFileSync(outputFile, JSON.stringify(metadata, null, 2), 'utf8');
  
  console.log(`\n=== Summary ===`);
  console.log(`Total albums: ${metadata.totalAlbums}`);
  console.log(`Found: ${metadata.foundAlbums}`);
  console.log(`Not found: ${metadata.notFoundAlbums}`);
  console.log(`Saved to: ${outputFile}`);
}

main().catch(console.error);
