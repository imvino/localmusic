import { decodeHtmlEntities, fetchFromMusicServiceOfficial } from '../_utils.js';

export const config = {
  runtime: 'edge'
};

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
      const searchResponse = await fetch(`https://jiosaavn-apix.arcadopredator.workers.dev/api/search?query=${encodeURIComponent(decodedId)}`);
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

    const artistData = officialData;

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
    let topSongs = Array.isArray(artistData.topSongs) ? artistData.topSongs : [];
    
    if (topSongs.length > 0) {
      const songIds = topSongs.map(s => s.id);
      try {
        const songsResponse = await fetch(`https://saavn.sumit.co/api/songs?ids=${songIds.join(',')}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const songsData = await songsResponse.json();
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
            const songsResponse = await fetch(`https://saavn.sumit.co/api/songs?ids=${songIds.join(',')}`, {
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const songsData = await songsResponse.json();
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
    let topAlbums = Array.isArray(artistData.topAlbums) ? artistData.topAlbums : [];
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
