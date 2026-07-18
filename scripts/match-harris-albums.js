const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001/api';
const OUTPUT_FILE = path.join(__dirname, '../data/harris-jayaraj-albums.json');

// Tamil albums from Wikipedia (all 53 albums including continuation rows)
const tamilAlbums = [
  { year: "2001", albumName: "Minnale" },
  { year: "2001", albumName: "Majunu" },
  { year: "2001", albumName: "12B" },
  { year: "2002", albumName: "Vetri" },
  { year: "2002", albumName: "Samurai" },
  { year: "2003", albumName: "Lesa Lesa" },
  { year: "2003", albumName: "Saamy" },
  { year: "2003", albumName: "Kaakha Kaakha" },
  { year: "2004", albumName: "Kovil" },
  { year: "2004", albumName: "Chellamae" },
  { year: "2004", albumName: "Arasatchi" },
  { year: "2004", albumName: "Arul" },
  { year: "2005", albumName: "Thotti Jaya" },
  { year: "2005", albumName: "Ullam Ketkumae" },
  { year: "2005", albumName: "Anniyan" },
  { year: "2005", albumName: "Ghajini" },
  { year: "2006", albumName: "Vettaiyaadu Vilaiyaadu" },
  { year: "2006", albumName: "Kumaran" },
  { year: "2007", albumName: "Pachaikili Muthucharam" },
  { year: "2007", albumName: "Unnale Unnale" },
  { year: "2007", albumName: "Vetri Thirumagan" },
  { year: "2008", albumName: "Bheemaa" },
  { year: "2008", albumName: "Satyam" },
  { year: "2008", albumName: "Dhaam Dhoom" },
  { year: "2008", albumName: "Vaaranam Aayiram" },
  { year: "2009", albumName: "Ayan" },
  { year: "2009", albumName: "Aadhavan" },
  { year: "2010", albumName: "Ramcharan" },
  { year: "2010", albumName: "Engeyum Kadhal" },
  { year: "2011", albumName: "Ko" },
  { year: "2011", albumName: "7 Aum Arivu" },
  { year: "2011", albumName: "Nanban" },
  { year: "2012", albumName: "Oru Kal Oru Kannadi" },
  { year: "2012", albumName: "Maattrraan" },
  { year: "2012", albumName: "Thuppakki" },
  { year: "2013", albumName: "Irandaam Ulagam" },
  { year: "2013", albumName: "Endrendrum Punnagai" },
  { year: "2014", albumName: "Idhu Kathirvelan Kadhal" },
  { year: "2014", albumName: "Yaan" },
  { year: "2014", albumName: "Anegan" },
  { year: "2014", albumName: "Nannbenda" },
  { year: "2015", albumName: "Yennai Arindhaal" },
  { year: "2016", albumName: "Iru Mugan" },
  { year: "2016", albumName: "S3" },
  { year: "2017", albumName: "Vanamagan" },
  { year: "2017", albumName: "Spyder" },
  { year: "2019", albumName: "Dev" },
  { year: "2019", albumName: "Kaappaan" },
  { year: "2022", albumName: "The Legend" },
  { year: "2023", albumName: "Extra Ordinary Man" },
  { year: "2024", albumName: "Brother" },
  { year: "2026", albumName: "Kadhal Reset Repeat" },
  { year: "2026", albumName: "Bad Boy Karthik" }
];

async function matchAlbum(album) {
  const query = `${album.albumName} tamil ${album.year}`;
  console.log(`Searching: "${query}"`);
  
  try {
    const response = await axios.get(`${API_BASE}/search`, {
      params: { q: query },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const albums = response.data?.data?.albums;
    if (albums && albums.length > 0) {
      // Get first album result
      const firstAlbum = albums[0];
      console.log(`  ✓ Found: ${firstAlbum.title} (ID: ${firstAlbum.id}, Year: ${firstAlbum.year})`);
      
      return {
        id: firstAlbum.id,
        name: firstAlbum.title,
        year: album.year, // Use Wikipedia year
        image: firstAlbum.image?.[0]?.url || null
      };
    } else {
      console.log(`  ✗ No match found`);
      return null;
    }
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Matching Harris Jayaraj albums with Jio Saavn...\n');
  
  const matchedAlbums = [];
  
  for (const album of tamilAlbums) {
    const match = await matchAlbum(album);
    if (match) {
      matchedAlbums.push(match);
    }
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\nMatched ${matchedAlbums.length} out of ${tamilAlbums.length} albums`);
  
  // Save to JSON
  const output = {
    artist: "Harris Jayaraj",
    artistId: "455243",
    totalAlbums: matchedAlbums.length,
    albums: matchedAlbums
  };
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${OUTPUT_FILE}`);
}

main().catch(console.error);
