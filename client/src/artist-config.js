// Artist configuration for custom overrides and label changes
// This is fetched from the API to maintain a single source of truth
import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Hook to fetch and use artist config
export const useArtistConfig = () => {
  const [config, setConfig] = useState({ customAlbums: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/artist-config`);
        if (response.ok) {
          const data = await response.json();
          setConfig(data);
        }
      } catch (error) {
        console.error('Failed to fetch artist config:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return { config, loading };
};

// Helper functions (use the config from the hook)
export const hasCustomAlbums = (config, artistId) => config.customAlbums[artistId] !== undefined

// Default to "Mix Tape" for all artists, but use "Albums" for artists with custom overrides
export const getAlbumsTabLabel = (config, artistId) => {
  return hasCustomAlbums(config, artistId) ? 'Albums' : 'Mix Tape'
}
