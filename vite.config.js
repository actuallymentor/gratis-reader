import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig( {

    plugins: [
        react(),
        VitePWA( {
            registerType: `autoUpdate`,
            manifest: {
                name: `Gratis Reader`,
                short_name: `Gratis Reader`,
                description: `Language-learning e-reader`,
                start_url: `/`,
                theme_color: `#7ec0d0`,
                background_color: `#ffffff`,
                display: `standalone`,
                icons: [
                    { src: `/favicon.svg`, sizes: `any`, type: `image/svg+xml` },
                    { src: `/icon-192.png`, sizes: `192x192`, type: `image/png` },
                    { src: `/icon-512.png`, sizes: `512x512`, type: `image/png`, purpose: `any maskable` }
                ]
            },
            workbox: {
                globPatterns: [ `**/*.{js,css,html,woff2}` ],
                navigateFallbackDenylist: [ /^\/gutenberg_epubs\// ],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com/,
                        handler: `StaleWhileRevalidate`
                    },
                    {
                        urlPattern: /^https:\/\/fonts\.gstatic\.com/,
                        handler: `CacheFirst`,
                        options: {
                            cacheName: `google-fonts-webfonts`,
                            expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
                        }
                    }
                ]
            }
        } )
    ],

    server: { port: 5173 },

    define: {
        'process.env': {}
    }

} )
