const SpotifyWebApi = require('spotify-web-api-node');

// Spotify credentials from your Developer Dashboard
const spotifyApi = new SpotifyWebApi({
  clientId: '19b1aa8a7bda45d48ff61dbfc42fcd96',
  clientSecret: '8699a3653fd4461082dde326ff2050a6',
  redirectUri: 'http://localhost:8888/callback'
});

async function testSpotifyApi() {
  try {
    console.log('Testing Spotify API...');
    console.log('Client ID:', spotifyApi.getClientId());
    console.log('Client Secret:', spotifyApi.getClientSecret().substring(0, 10) + '...');
    
    // Get an access token (Client Credentials Flow)
    console.log('\n1. Getting access token...');
    const tokenResponse = await spotifyApi.clientCredentialsGrant();
    console.log('✓ Access token obtained');
    console.log(`  Token type: ${tokenResponse.body.token_type}`);
    console.log(`  Expires in: ${tokenResponse.body.expires_in} seconds`);
    console.log(`  Access token: ${tokenResponse.body.access_token.substring(0, 20)}...`);
    
    // Set the access token
    spotifyApi.setAccessToken(tokenResponse.body.access_token);
    
    // Test: Get a specific track by ID (simpler endpoint)
    console.log('\n2. Testing with a known track ID...');
    try {
      const track = await spotifyApi.getTrack('3n3Ppam7vgaVa1iaRUc9Lp'); // A popular track
      console.log('✓ Track fetch successful!');
      console.log(`  Track: ${track.body.name} by ${track.body.artists[0].name}`);
    } catch (trackError) {
      console.log('✗ Track fetch failed:', trackError.message);
    }
    
    // Test: Search for Tamil music
    console.log('\n3. Searching for Tamil music...');
    try {
      const searchResults = await spotifyApi.searchTracks('Tamil', { limit: 3, market: 'IN' });
      console.log('✓ Search successful!');
      if (searchResults.body.tracks && searchResults.body.tracks.items.length > 0) {
        searchResults.body.tracks.items.forEach((track, index) => {
          console.log(`  ${index + 1}. ${track.name} by ${track.artists[0].name}`);
        });
      } else {
        console.log('  No tracks found');
      }
    } catch (searchError) {
      console.log('✗ Search failed:', searchError.message);
      console.log('  Status:', searchError.statusCode);
    }
    
    console.log('\n✅ Spotify API test completed!');
    
  } catch (error) {
    console.error('❌ Spotify API test failed:');
    console.error(`Error message: ${error.message}`);
    if (error.statusCode) {
      console.error(`Status Code: ${error.statusCode}`);
    }
    if (error.body) {
      console.error(`Response body: ${JSON.stringify(error.body, null, 2)}`);
    }
    console.error('\nPossible issues:');
    console.error('1. App is in Development mode - may have restrictions');
    console.error('2. Need to add redirect URI in Spotify Dashboard');
    console.error('3. Rate limiting or IP restrictions');
    console.error('4. Client credentials may need to be regenerated');
  }
}

testSpotifyApi();
