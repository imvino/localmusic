import { decodeHtmlEntities, fetchFromMusicServiceOfficial } from '../_utils.js';
import { PRIMARY_API, FALLBACK_API } from '../../client/src/constants.js';

export const config = {
  runtime: 'edge'
};

// 3-tier fallback helper for Edge functions
async function fetchWithFallback(endpoint, params, type = 'songs') {
  
  // Try primary API first
  try {
    console.log(`Trying primary API for ${type}`);
    const url = new URL(`${PRIMARY_API}/${endpoint}`);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.ok) throw new Error(`Primary API failed: ${response.status}`);
    return await response.json();
  } catch (primaryError) {
    console.log(`Primary API failed for ${type}, trying fallback API`);
    
    // Try fallback API
    try {
      const url = new URL(`${FALLBACK_API}/${endpoint}`);
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!response.ok) throw new Error(`Fallback API failed: ${response.status}`);
      return await response.json();
    } catch (fallbackError) {
      console.error(`Fallback API also failed for ${type}:`, fallbackError.message);
      
      // Try official JioSaavn API as third fallback
      console.log(`Trying official JioSaavn API for ${type}`);
      try {
        let officialParams;
        
        if (type === 'songs') {
          officialParams = {
            __call: 'song.getDetails',
            pids: params.ids
          };
        } else if (type === 'albums') {
          officialParams = {
            __call: 'album.getDetails',
            albumid: params.id
          };
        } else if (type === 'playlists') {
          officialParams = {
            __call: 'playlist.getDetails',
            listid: params.id
          };
        }
        
        const officialData = await fetchFromMusicServiceOfficial(officialParams.__call, officialParams);
        
        // Normalize official API response to match primary API structure
        if (officialData) {
          if (type === 'songs') {
            const songs = Array.isArray(officialData) ? officialData : 
                          (officialData.songs ? officialData.songs : [officialData]);
            return {
              data: songs.map(song => ({
                id: song.id,
                name: song.title || song.song || song.name,
                album: song.more_info?.album,
                year: song.year || song.more_info?.release_date?.substring(0, 4),
                duration: parseInt(song.more_info?.duration) || 0,
                image: song.image ? [{ quality: '500x500', url: song.image }] : [],
                artists: {
                  primary: song.more_info?.artistMap?.primary_artists?.map(a => ({
                    id: a.id,
                    name: a.name,
                    image: a.image
                  })) || []
                },
                downloadUrl: song.more_info?.encrypted_media_url ? [{
                  quality: '320kbps',
                  url: song.more_info.encrypted_media_url
                }] : []
              }))
            };
          } else if (type === 'albums') {
            const album = Array.isArray(officialData) ? officialData[0] : officialData;
            return {
              data: {
                id: album.albumid || album.id,
                name: album.title || album.name,
                year: album.year || album.more_info?.release_date?.substring(0, 4),
                image: album.image ? [{ quality: '500x500', url: album.image }] : [],
                songs: album.songs?.map(s => ({
                  id: s.id,
                  name: s.title || s.song || s.name,
                  duration: parseInt(s.more_info?.duration) || 0
                })) || []
              }
            };
          } else if (type === 'playlists') {
            const playlist = Array.isArray(officialData) ? officialData[0] : officialData;
            return {
              data: {
                id: playlist.listid || playlist.id,
                name: playlist.title || playlist.name,
                image: playlist.image ? [{ quality: '500x500', url: playlist.image }] : [],
                songs: playlist.songs?.map(s => ({
                  id: s.id,
                  name: s.title || s.song || s.name,
                  duration: parseInt(s.more_info?.duration) || 0
                })) || []
              }
            };
          }
        }
        
        return null;
      } catch (officialError) {
        console.error(`Official API also failed for ${type}:`, officialError.message);
        return null;
      }
    }
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];
  
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const language = url.searchParams.get('language') || 'all';
  const sort = url.searchParams.get('sort') || 'popular';

  // Decode the ID if it's an encoded artist name
  const decodedId = decodeURIComponent(id);
  const isEncodedName = isNaN(id) && id !== decodedId;
  const isArtistName = isNaN(id) && !id.match(/^\d+$/);

  // If it's an encoded name or just an artist name (not numeric ID), use fallback API
  if (isEncodedName || isArtistName) {
    try {
      const searchResponse = await fetch(`${FALLBACK_API}/search?query=${encodeURIComponent(decodedId)}`);
      const searchResults = await searchResponse.json();
      
      const songs = searchResults?.response?.songs || searchResults?.results || searchResults?.songs || [];
      
      if (songs.length > 0) {
        const firstSong = songs[0];
        const artistName = firstSong.more_info?.singers?.split(',')[0]?.trim() || 
                          firstSong.description?.split('·')[0]?.trim() || 
                          decodedId;
        
        const artistData = {
          id: id,
          name: artistName,
          followerCount: 0,
          isVerified: false,
          dominantLanguage: firstSong.more_info?.language || 'Unknown',
          bio: '',
          image: firstSong.image ? [{ quality: '500x500', url: firstSong.image }] : [],
          similarArtists: [],
          topSongs: songs.slice(0, limit).map(song => ({
            id: song.id,
            name: song.title || song.song,
            album: { name: song.album },
            year: song.year || 0,
            duration: 0,
            image: song.image ? [{ quality: '500x500', url: song.image }] : [],
            artists: { primary: song.more_info?.singers ? song.more_info.singers.split(', ').map(name => ({ id: encodeURIComponent(name.trim()), name: name.trim() })) : [] },
            downloadUrl: song.api_url?.song ? [{ quality: 'api', url: song.api_url.song }] : [],
            playCount: 0,
            isLocal: false
          })),
          topAlbums: []
        };
        
        return new Response(JSON.stringify({ success: true, data: artistData }), {
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          }
        });
      } else {
        return new Response(JSON.stringify({ error: 'Artist not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (searchError) {
      console.error('Artist search failed:', searchError.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch artist' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Original logic for numeric IDs
  try {
    let sort_order = '';
    if (sort === 'date') sort_order = 'latest';
    else if (sort === 'name') sort_order = 'alphabetical';
    else if (sort === 'popular') sort_order = 'popularity';

    let category = language === 'all' ? '' : language;

    // Fetch all pages of songs
    let allTopSongs = [];
    let songIdSet = new Set(); // Track unique song IDs for deduplication
    let page = 1;
    let hasMoreSongs = true;
    const maxPages = 20; // Safety limit to prevent infinite loops

    while (hasMoreSongs && page <= maxPages) {
      const officialData = await fetchFromMusicServiceOfficial('artist.getArtistPageDetails', {
        artistId: id,
        p: page,
        n_song: limit,
        n_album: limit,
        category: category,
        sort_order: sort_order,
        more: true,
        includeMetaTags: 0
      });

      if (!officialData) {
        break;
      }

      const pageSongs = Array.isArray(officialData.topSongs) ? officialData.topSongs : [];
      
      if (pageSongs.length === 0) {
        hasMoreSongs = false;
      } else {
        // Add only unique songs by ID
        let newSongsAdded = 0;
        for (const song of pageSongs) {
          if (!songIdSet.has(song.id)) {
            songIdSet.add(song.id);
            allTopSongs.push(song);
            newSongsAdded++;
          }
        }
        
        // If no new songs were added, we've reached the end
        if (newSongsAdded === 0) {
          hasMoreSongs = false;
        } else {
          page++;
        }
      }

      // Store the first page's artist data (bio, similar artists, etc.)
      if (page === 1) {
        var artistData = officialData;
      }
    }

    // Fetch all pages of albums
    let allTopAlbums = [];
    let albumIdSet = new Set(); // Track unique album IDs for deduplication
    let albumPage = 1;
    let hasMoreAlbums = true;

    while (hasMoreAlbums && albumPage <= maxPages) {
      const officialData = await fetchFromMusicServiceOfficial('artist.getArtistPageDetails', {
        artistId: id,
        p: albumPage,
        n_song: limit,
        n_album: limit,
        category: category,
        sort_order: sort_order,
        more: true,
        includeMetaTags: 0
      });

      if (!officialData) {
        break;
      }

      const pageAlbums = Array.isArray(officialData.topAlbums) ? officialData.topAlbums : [];
      
      if (pageAlbums.length === 0) {
        hasMoreAlbums = false;
      } else {
        // Add only unique albums by ID
        let newAlbumsAdded = 0;
        for (const album of pageAlbums) {
          if (!albumIdSet.has(album.id)) {
            albumIdSet.add(album.id);
            allTopAlbums.push(album);
            newAlbumsAdded++;
          }
        }
        
        // If no new albums were added, we've reached the end
        if (newAlbumsAdded === 0) {
          hasMoreAlbums = false;
        } else {
          albumPage++;
        }
      }
    }

    // If no songs were fetched, use the first page data anyway
    if (!artistData) {
      const officialData = await fetchFromMusicServiceOfficial('artist.getArtistPageDetails', {
        artistId: id,
        p: 1,
        n_song: limit,
        n_album: limit,
        category: category,
        sort_order: sort_order,
        more: true,
        includeMetaTags: 0
      });

      if (!officialData) {
        return new Response(JSON.stringify({ error: 'Failed to fetch artist from official API' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      artistData = officialData;
      allTopSongs = Array.isArray(artistData.topSongs) ? artistData.topSongs : [];
    }

    // Helper for images
    const getBestImage = (imageObj) => {
      if (typeof imageObj === 'string') {
        if (imageObj.includes('share-image-2.png')) {
          return '/logo_512x512.png';
        }
        return imageObj;
      }
      if (!imageObj || !Array.isArray(imageObj)) return null;
      const best = imageObj.find(img => img.quality === '500x500') || imageObj.find(img => img.quality === '150x150') || imageObj[imageObj.length - 1];
      let url = best ? best.url : null;
      
      if (url && url.includes('share-image-2.png')) {
        return '/logo_512x512.png';
      }
      
      return url;
    };

    // Normalize Bio
    let bioText = '';
    if (artistData.bio) {
      try {
        const parsedBio = typeof artistData.bio === 'string' ? JSON.parse(artistData.bio) : artistData.bio;
        if (Array.isArray(parsedBio) && parsedBio.length > 0) {
          bioText = parsedBio[0]?.text || parsedBio[0]?.title || '';
        }
      } catch(e) {
        bioText = typeof artistData.bio === 'string' && artistData.bio !== '[]' ? artistData.bio : '';
      }
    }

    // Normalize Similar Artists
    let similarArtists = [];
    if (artistData.similarArtists && Array.isArray(artistData.similarArtists)) {
      similarArtists = artistData.similarArtists.map(a => ({
        id: a.perma_url ? a.perma_url.split('/').filter(Boolean).pop() : a.id,
        name: a.name,
        image: [{ quality: '500x500', url: a.image_url || a.image }]
      }));
    }

    const normalizedArtist = {
      id: artistData.artistId || id,
      name: artistData.name,
      followerCount: artistData.follower_count,
      isVerified: artistData.isVerified,
      dominantLanguage: artistData.dominantLanguage,
      bio: bioText,
      image: [{ quality: '500x500', url: typeof artistData.image === 'string' ? artistData.image : getBestImage(artistData.image) }],
      similarArtists: similarArtists
    };

    // Normalize Top Songs
    let topSongs = allTopSongs;
    
    if (topSongs.length > 0) {
      const songIds = topSongs.map(s => s.id);
      try {
        const songsData = await fetchWithFallback('songs', { ids: songIds.join(',') }, 'songs');
        const richSongsData = songsData?.data || [];
        const songDetailsMap = richSongsData.reduce((acc, song) => {
          acc[song.id] = song;
          return acc;
        }, {});

        normalizedArtist.topSongs = topSongs.map(song => {
          const rich = songDetailsMap[song.id] || {};
          return {
            id: song.id,
            name: song.title || song.name,
            album: { name: rich.album?.name || song.more_info?.album },
            year: rich.year || song.year,
            duration: rich.duration || song.more_info?.duration,
            image: rich.image || (song.image ? [{ quality: '500x500', url: song.image }] : []),
            artists: rich.artists || { primary: [{ name: artistData.name }] },
            downloadUrl: rich.downloadUrl || [],
            playCount: rich.playCount || song.play_count || 0,
            language: song.language,
            isLocal: false
          };
        });
      } catch (err) {
        console.error('Failed to fetch rich song data:', err.message);
        normalizedArtist.topSongs = topSongs.map(song => ({
          id: song.id,
          name: song.title || song.name,
          album: { name: song.more_info?.album },
          year: song.year,
          duration: song.more_info?.duration,
          image: song.image ? [{ quality: '500x500', url: song.image }] : [],
          downloadUrl: [],
          playCount: song.play_count || 0,
          language: song.language,
          isLocal: false
        }));
      }
    } else {
      // Fallback: Search for songs by artist name if topSongs is empty
      try {
        const searchResponse = await fetchFromMusicServiceOfficial('search.getSongResults', {
          q: artistData.name,
          p: 1,
          n: limit,
          language: language
        });
        
        if (searchResponse && searchResponse.results) {
          const searchSongs = Object.values(searchResponse.results);
          const songIds = searchSongs.map(s => s.id || s.tokenid).filter(Boolean);
          
          if (songIds.length > 0) {
            const songsData = await fetchWithFallback('songs', { ids: songIds.join(',') }, 'songs');
            const richSongsData = songsData?.data || [];
            normalizedArtist.topSongs = richSongsData.map(song => ({
              id: song.id,
              name: song.name || song.title,
              album: { name: song.album?.name },
              year: song.year,
              duration: song.duration,
              image: song.image ? [{ quality: '500x500', url: song.image.find(img => img.quality === '500x500')?.url || song.image[0]?.url }] : [],
              artists: song.artists || { primary: [{ name: artistData.name }] },
              downloadUrl: song.downloadUrl || [],
              playCount: song.playCount || 0,
              language: song.language,
              isLocal: false
            }));
          } else {
            normalizedArtist.topSongs = [];
          }
        } else {
          normalizedArtist.topSongs = [];
        }
      } catch (fallbackError) {
        console.error('Fallback song search failed:', fallbackError.message);
        normalizedArtist.topSongs = [];
      }
    }

    // Normalize Top Albums
    let topAlbums = allTopAlbums.length > 0 ? allTopAlbums : (Array.isArray(artistData.topAlbums) ? artistData.topAlbums : []);
    normalizedArtist.topAlbums = topAlbums.map(album => {
      let albumId = album.id;
      let imageUrl = album.image;
      if (imageUrl && typeof imageUrl === 'string') {
        imageUrl = imageUrl.replace('-150x150.jpg', '-500x500.jpg');
      }

      return {
        id: albumId,
        name: album.title || album.name,
        year: album.year,
        image: imageUrl ? [{ quality: '500x500', url: imageUrl }] : [],
        playCount: album.play_count || 0,
        isLocal: false
      };
    });

    return new Response(JSON.stringify({ success: true, data: normalizedArtist }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('Artist error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch artist' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
