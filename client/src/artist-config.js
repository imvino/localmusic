// Artist configuration for custom overrides and label changes
export const ARTIST_CONFIG = {
  // Artists with custom album overrides from local metadata
  customAlbums: {
    '455243': {
      name: 'Harris Jayaraj'
    },
    '456091': {
      name: 'Yuvan Shankar Raja'
    }
  }
}

// Helper functions
export const hasCustomAlbums = (artistId) => ARTIST_CONFIG.customAlbums[artistId] !== undefined

// Default to "Mix Tape" for all artists, but use "Albums" for artists with custom overrides
export const getAlbumsTabLabel = (artistId) => {
  return hasCustomAlbums(artistId) ? 'Albums' : 'Mix Tape'
}
