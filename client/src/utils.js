export function getAlbums(songs) {
  const albumMap = new Map()
  songs.forEach(song => {
    if (!albumMap.has(song.album)) {
      albumMap.set(song.album, {
        name: song.album,
        composer: song.composer || '',
        year: song.year || '',
        artworkUrl: song.moviePosterUrl || song.artworkUrl || null,
        songs: [],
        createdAt: song.createdAt || new Date().toISOString(),
        starring: song.starring || '',
        starringEnriched: song.starringEnriched || [],
        director: song.director || '',
        directorEnriched: song.directorEnriched || [],
      })
    }
    const album = albumMap.get(song.album)
    album.songs.push(song)
    
    // Aggregate lyricists
    if (song.lyricist) {
      const currentLyricists = album.lyricist ? album.lyricist.split(/,\s*/) : []
      const newLyricists = song.lyricist.split(/,\s*/)
      const merged = [...new Set([...currentLyricists, ...newLyricists])].filter(Boolean)
      album.lyricist = merged.join(', ')
    }
    
    // Merge enriched lyricists if available
    if (song.lyricistEnriched && song.lyricistEnriched.length > 0) {
      const currentEnriched = album.lyricistEnriched || []
      const newEnriched = song.lyricistEnriched.filter(e => !currentEnriched.some(ce => ce.name === e.name))
      album.lyricistEnriched = [...currentEnriched, ...newEnriched]
    }

    if (!album.artworkUrl && song.moviePosterUrl) album.artworkUrl = song.moviePosterUrl
    if (!album.artworkUrl && song.artworkUrl) album.artworkUrl = song.artworkUrl
  })
  albumMap.forEach(album => {
    album.songs.sort((a, b) => (a.trackNumber || 999) - (b.trackNumber || 999))
    album.trackCount = album.songs.length
  })
  return Array.from(albumMap.values())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function parseDownloads(str) {
  if (!str) return 0
  return parseInt(String(str).replace(/,/g, ''), 10) || 0
}

export function getPeople(songs) {
  const personMap = new Map()

  const addPerson = (rawName, role, enrichedList, song) => {
    const raw = rawName.trim()
    if (!raw) return
    const rawKey = raw.toLowerCase()
    let enriched = enrichedList?.find(e =>
      e.name?.toLowerCase() === rawKey ||
      e.name?.toLowerCase().startsWith(rawKey + ' ') ||
      e.name?.toLowerCase().split(' ')[0] === rawKey
    )
    // Positional fallback: if a single enriched entry was passed (positionally matched), use it
    if (!enriched && enrichedList?.length === 1) {
      enriched = enrichedList[0]
    }
    // Use TMDB name as canonical name when available
    const name = enriched?.name || raw
    const key = name.toLowerCase()
    if (!personMap.has(key)) {
      personMap.set(key, {
        name,
        roles: new Set([role]),
        profileUrl: enriched?.profileUrl || null,
        songs: [],
        albumSet: new Set()
      })
    }
    const p = personMap.get(key)
    p.roles.add(role)
    if (!p.songs.find(s => s.id === song.id)) p.songs.push(song)
    p.albumSet.add(song.album)
    if (!p.profileUrl && enriched?.profileUrl) p.profileUrl = enriched.profileUrl
  }

  const splitNames = str => (str || '').replace(/&/g, ',').split(/,\s*/).filter(Boolean)

  songs.forEach(song => {
    splitNames(song.composer).forEach((n, i) =>
      addPerson(n, 'composer', song.composerEnriched?.[i] != null ? [song.composerEnriched[i]] : null, song))
    splitNames(song.singers).forEach((n, i) =>
      addPerson(n, 'singer', song.singersEnriched?.[i] != null ? [song.singersEnriched[i]] : null, song))
    splitNames(song.lyricist).forEach((n, i) =>
      addPerson(n, 'lyricist', song.lyricistEnriched?.[i] != null ? [song.lyricistEnriched[i]] : null, song))
    splitNames(song.director).forEach((n, i) =>
      addPerson(n, 'director', song.directorEnriched?.[i] != null ? [song.directorEnriched[i]] : null, song))
    splitNames(song.starring).forEach((n, i) =>
      addPerson(n, 'actor', song.starringEnriched?.[i] != null ? [song.starringEnriched[i]] : null, song))
  })

  return Array.from(personMap.values())
    .map(p => ({
      ...p,
      roles: Array.from(p.roles),
      albumNames: Array.from(p.albumSet),
      albumSet: undefined
    }))
    .sort((a, b) => b.songs.length - a.songs.length)
}

export function getArtists(songs) {
  return getPeople(songs)
}

export function resolveNames(rawStr, enrichedArr) {
  if (!rawStr) return []
  return rawStr.replace(/&/g, ',').split(/,\s*/).filter(Boolean).map((raw, i) =>
    enrichedArr?.[i]?.name || raw.trim()
  )
}

export function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
