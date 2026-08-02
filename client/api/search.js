import { decodeHtmlEntities, fetchFromMusicServiceOfficial } from './_utils.js';

export const config = {
  runtime: 'edge'
};

export default async function handler(req) {
  const url = new URL(req.url);
  const query = url.searchParams.get('q');
  
  if (!query) {
    return new Response(JSON.stringify({ error: 'Query parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const limit = parseInt(url.searchParams.get('n')) || 20;
  const page = parseInt(url.searchParams.get('p')) || 1;

  try {
    // Search across multiple types in parallel using official API
    const [songsData, albumsData, artistsData, playlistsData] = await Promise.all([
      fetchFromMusicServiceOfficial('search.getResults', { q: query, p: page, n: limit }),
      fetchFromMusicServiceOfficial('search.getAlbumResults', { q: query, p: page, n: limit }),
      fetchFromMusicServiceOfficial('search.getArtistResults', { q: query, p: page, n: limit }),
      fetchFromMusicServiceOfficial('search.getPlaylistResults', { q: query, p: page, n: limit })
    ]);

    // Helper to normalize API response format
    const normalizeResults = (data, type) => {
      if (!data || !data.results) return [];
      const results = Array.isArray(data.results) ? data.results : Object.values(data.results);
      return results.map(item => {
        // Normalize artist data structure
        let artists = { primary: [] };
        if (item.more_info?.artistMap?.primary_artists) {
          artists.primary = item.more_info.artistMap.primary_artists.map(a => ({
            id: a.id,
            name: a.name,
            image: a.image,
            role: a.role || 'primary_artists'
          }));
        } else if (item.primary_artists) {
          if (typeof item.primary_artists === 'string') {
            artists.primary = item.primary_artists.split(',').map(name => ({
              id: encodeURIComponent(name.trim()),
              name: name.trim(),
              image: null,
              role: 'primary_artists'
            }));
          } else if (Array.isArray(item.primary_artists)) {
            artists.primary = item.primary_artists.map(a => ({
              id: a.id || encodeURIComponent(a.name),
              name: a.name,
              image: a.image || null,
              role: a.role || 'primary_artists'
            }));
          }
        } else if (item.artists) {
          if (typeof item.artists === 'string') {
            artists.primary = item.artists.split(',').map(name => ({
              id: encodeURIComponent(name.trim()),
              name: name.trim(),
              image: null,
              role: 'primary_artists'
            }));
          } else if (Array.isArray(item.artists)) {
            artists.primary = item.artists.map(a => ({
              id: a.id || encodeURIComponent(a.name),
              name: a.name,
              image: a.image || null,
              role: a.role || 'primary_artists'
            }));
          }
        }

        // Convert 50x50 to 150x150 for better resolution on artist images
        const imageUrl = item.image ? item.image.replace('50x50', '150x150') : item.image;

        // Handle album field - could be string or object
        let album = null;
        let albumId = null;
        if (item.more_info?.album) {
          if (typeof item.more_info.album === 'string') {
            album = { name: item.more_info.album };
          } else if (typeof item.more_info.album === 'object') {
            album = item.more_info.album;
            albumId = item.more_info.album.id || null;
          }
        }

        // Get song name from multiple possible fields
        const songName = item.song || item.title || item.name || item.more_info?.song || item.more_info?.title || '';

        // Try to extract album name from album_url if album field is null
        if (!album && item.album_url) {
          const albumMatch = item.album_url.match(/\/album\/([^\/]+)/);
          if (albumMatch) {
            album = { name: decodeHtmlEntities(albumMatch[1].replace(/-/g, ' ')) };
          }
        }

        return {
          ...item,
          id: item.id || item.tokenid || item.albumid,
          name: songName,
          artists: artists,
          album: album,
          albumId: albumId,
          year: item.year || item.more_info?.year || null,
          image: imageUrl ? [{ quality: '150x150', url: imageUrl }] : [],
          imageUrl: imageUrl || null,
          isLocal: false // Edge functions don't have access to local library
        };
      });
    };

    // Fetch artist images for search results
    let artistsWithImages = normalizeResults(artistsData, 'artist');
    if (artistsWithImages.length > 0) {
      artistsWithImages = await Promise.all(artistsWithImages.map(async (artist) => {
        try {
          const artistDetail = await fetchFromMusicServiceOfficial('artist.getArtistPageDetails', {
            artistId: artist.id,
            p: 1,
            n_song: 1,
            n_album: 1
          });
          if (artistDetail && artistDetail.image) {
            const imageUrl = artistDetail.image ? artistDetail.image.replace('50x50', '150x150') : '';
            return {
              ...artist,
              image: imageUrl ? [{ quality: '150x150', url: imageUrl }] : []
            };
          }
        } catch (e) {
          // If detail fetch fails, keep original artist data
        }
        return artist;
      }));
    }

    const response = {
      success: true,
      data: {
        topResult: null,
        songs: normalizeResults(songsData, 'song'),
        albums: normalizeResults(albumsData, 'album'),
        artists: artistsWithImages,
        playlists: normalizeResults(playlistsData, 'playlist')
      }
    };

    // Set top result - prioritize songs, then albums
    if (response.data.songs.length > 0) {
      const { type, ...topSong } = response.data.songs[0];
      response.data.topResult = { ...topSong, type: 'song' };
    } else if (response.data.albums.length > 0) {
      const { type, ...topAlbum } = response.data.albums[0];
      response.data.topResult = { ...topAlbum, type: 'album' };
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    return new Response(JSON.stringify({ error: 'Failed to perform search' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
