import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  console.log('VITE_API_URL:', env.VITE_API_URL)
  
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'Torsongs',
          short_name: 'Torsongs',
          description: 'Stream your favorite Tamil music',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: '/logo_192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/logo_512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              // Audio streams (any origin — dev same-origin, prod Render API).
              // The element always sends Range → server answers 206, which the
              // Cache API CANNOT store. So on cache-miss we strip Range and fetch
              // the full file (200, cacheable); rangeRequests then serves slices
              // of the cached body for seeks. Cost: one full download per song.
              // NOTE: Workbox RegExp routes must match cross-origin URLs from
              // href index 0 — an unanchored pattern never matches :3001.
              urlPattern: /^https?:\/\/[^/]+\/api\/stream\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'audio-cache',
                rangeRequests: true, // serve seeks from the cached full response
                plugins: [
                  {
                    requestWillFetch: async ({ request }) => {
                      if (!request.headers.has('range')) return request
                      const headers = new Headers(request.headers)
                      headers.delete('range')
                      return new Request(request.url, { headers, mode: 'cors' })
                    }
                  }
                ],
                cacheableResponse: {
                  statuses: [0, 200] // 206 is uncacheable by design (Cache API)
                },
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                  purgeOnQuotaError: true
                }
              }
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@songs-data': resolve(__dirname, '../music-library.json')
      }
    },
    server: {
      host: true,
      fs: {
        allow: ['..']
      },
      proxy: {
        '/api': {
          target: env.VITE_API_URL?.replace('/api', '') || 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
          configure: (proxy, options) => {
            proxy.on('proxyReq', (proxyReq, req, res) => {
              proxyReq.setHeader('Origin', options.target)
            })
          }
        }
      }
    }
  }
})
