const { google } = require('googleapis');

// YouTube API configuration
const YOUTUBE_API_KEY = 'AIzaSyB1GS6tGy_DThbfAR3-piB-EdLwS5rz-5A';

async function testYouTubeApi() {
  try {
    console.log('Testing YouTube Data API...');
    console.log('API Key:', YOUTUBE_API_KEY.substring(0, 10) + '...');
    
    const youtube = google.youtube({
      version: 'v3',
      auth: YOUTUBE_API_KEY
    });

    // Test 1: Get trending music videos in India
    console.log('\n1. Fetching trending music videos in India...');
    const trendingResponse = await youtube.videos.list({
      part: 'snippet,contentDetails,statistics',
      chart: 'mostPopular',
      regionCode: 'IN',
      videoCategoryId: '10', // Music category
      maxResults: 10
    });

    if (trendingResponse.data.items && trendingResponse.data.items.length > 0) {
      console.log('✓ Trending videos fetched successfully!');
      console.log(`Found ${trendingResponse.data.items.length} videos:\n`);
      
      trendingResponse.data.items.forEach((video, index) => {
        console.log(`${index + 1}. ${video.snippet.title}`);
        console.log(`   Channel: ${video.snippet.channelTitle}`);
        console.log(`   Views: ${parseInt(video.statistics.viewCount).toLocaleString()}`);
        console.log(`   Published: ${video.snippet.publishedAt}`);
        console.log(`   Video ID: ${video.id}`);
        console.log(`   URL: https://www.youtube.com/watch?v=${video.id}\n`);
      });
    } else {
      console.log('✗ No trending videos found');
    }

    // Test 2: Search for Tamil trending songs
    console.log('\n2. Searching for "Tamil trending songs 2025"...');
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: 'Tamil trending songs 2025',
      type: 'video',
      maxResults: 5,
      order: 'relevance',
      regionCode: 'IN'
    });

    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      console.log('✓ Search successful! Found videos:\n');
      searchResponse.data.items.forEach((item, index) => {
        console.log(`${index + 1}. ${item.snippet.title}`);
        console.log(`   Channel: ${item.snippet.channelTitle}`);
        console.log(`   URL: https://www.youtube.com/watch?v=${item.id.videoId}\n`);
      });
    } else {
      console.log('✗ No search results found');
    }

    // Test 3: Search for Harris Jayaraj mix
    console.log('\n3. Searching for "Harris Jayaraj DJ mix"...');
    const harrisResponse = await youtube.search.list({
      part: 'snippet',
      q: 'Harris Jayaraj DJ mix Tamil',
      type: 'video',
      maxResults: 5,
      order: 'viewCount',
      regionCode: 'IN'
    });

    if (harrisResponse.data.items && harrisResponse.data.items.length > 0) {
      console.log('✓ Harris Jayaraj mix search successful!\n');
      harrisResponse.data.items.forEach((item, index) => {
        console.log(`${index + 1}. ${item.snippet.title}`);
        console.log(`   Channel: ${item.snippet.channelTitle}`);
        console.log(`   URL: https://www.youtube.com/watch?v=${item.id.videoId}\n`);
      });
    } else {
      console.log('✗ No Harris Jayaraj mixes found');
    }

    // Test 4: Search for Vijay songs
    console.log('\n4. Searching for "Vijay songs Tamil"...');
    const vijayResponse = await youtube.search.list({
      part: 'snippet',
      q: 'Vijay songs Tamil',
      type: 'video',
      maxResults: 5,
      order: 'viewCount',
      regionCode: 'IN'
    });

    if (vijayResponse.data.items && vijayResponse.data.items.length > 0) {
      console.log('✓ Vijay songs search successful!\n');
      vijayResponse.data.items.forEach((item, index) => {
        console.log(`${index + 1}. ${item.snippet.title}`);
        console.log(`   Channel: ${item.snippet.channelTitle}`);
        console.log(`   URL: https://www.youtube.com/watch?v=${item.id.videoId}\n`);
      });
    } else {
      console.log('✗ No Vijay songs found');
    }

    console.log('\n✅ YouTube API test completed successfully!');
    console.log('\nQuota usage check:');
    console.log('- Trending fetch: 1 unit');
    console.log('- Search requests: 100 units each (4 searches = 400 units)');
    console.log('- Total used: ~401 units out of 10,000 daily quota');

  } catch (error) {
    console.error('❌ YouTube API test failed:');
    console.error(`Error: ${error.message}`);
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    console.error('\nPossible issues:');
    console.error('1. API key is invalid or expired');
    console.error('2. YouTube Data API not enabled in Google Cloud Console');
    console.error('3. Quota exceeded');
    console.error('4. API key restrictions (IP, referer, etc.)');
  }
}

testYouTubeApi();
