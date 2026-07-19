import { useQuery } from '@tanstack/react-query'

const API_BASE = import.meta.env.VITE_API_URL

// Helper function for fetch with error handling
async function fetchAPI(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, options)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

// Detail endpoints
export function useAlbum(id) {
  return useQuery({
    queryKey: ['album', id],
    queryFn: () => fetchAPI(`/album/${id}`),
    select: (data) => data.data || null,
    enabled: !!id,
  })
}

export function useArtist(id, limit = 50, language = 'all') {
  return useQuery({
    queryKey: ['artist', id, limit, language],
    queryFn: () => fetchAPI(`/artist/${id}?limit=${limit}&language=${language}`),
    select: (data) => data.data || null,
    enabled: !!id,
  })
}

export function usePlaylist(id) {
  return useQuery({
    queryKey: ['playlist', id],
    queryFn: () => fetchAPI(`/playlist/${id}`),
    select: (data) => data.data || null,
    enabled: !!id,
  })
}

// Search endpoint
export function useSearch(query) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => fetchAPI(`/search?q=${encodeURIComponent(query)}`),
    select: (data) => data.data || null,
    enabled: !!query && query.trim().length > 0,
  })
}

// JioSaavn API endpoints
export function useJioFooterDetails() {
  return useQuery({
    queryKey: ['jio-footer-details'],
    queryFn: () => fetchAPI('/jio/footer-details'),
    select: (data) => data.data || { artist: [], playlist: [] },
  })
}

export function useJioFeaturedPlaylists() {
  return useQuery({
    queryKey: ['jio-featured-playlists'],
    queryFn: () => fetchAPI('/jio/featured-playlists'),
    select: (data) => data.data || [],
  })
}

export function useJioNewReleases() {
  return useQuery({
    queryKey: ['jio-new-releases'],
    queryFn: () => fetchAPI('/jio/new-releases'),
    select: (data) => data.data || [],
  })
}

// Health check endpoint
export function useHealthCheck(enabled = true) {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      if (!response.ok) {
        throw new Error('Health check failed')
      }
      return response.json()
    },
    enabled,
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 3,
  })
}
