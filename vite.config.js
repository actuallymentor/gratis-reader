import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

const build_commit_hash = () => {

    const environment_commit = [
        process.env.CF_PAGES_COMMIT_SHA,
        process.env.GITHUB_SHA,
        process.env.COMMIT_REF,
        process.env.COMMIT_SHA
    ].find( Boolean )

    if( environment_commit ) return environment_commit.slice( 0, 12 )

    try {
        return execSync( `git rev-parse --short=12 HEAD`, { encoding: `utf8` } ).trim()
    } catch {
        return `unknown`
    }

}

const commit_hash = build_commit_hash()

export default defineConfig( {

    plugins: [
        react(),
        VitePWA( {
            registerType: `prompt`,
            injectRegister: null,
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
                globPatterns: [ `**/*.{js,css,html}` ],
                // Fonts are subset per script; cache the ones a reader actually uses instead of precaching all
                globIgnores: [ `fonts/**` ],
                navigateFallbackDenylist: [ /^\/gutenberg_epubs\// ],
                runtimeCaching: [
                    {
                        urlPattern: ( { url } ) => url.pathname.startsWith( `/fonts/` ),
                        handler: `CacheFirst`,
                        options: {
                            cacheName: `fonts`,
                            expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }
                        }
                    },
                    {
                        urlPattern: ( { url } ) => url.pathname === `/gutenberg.json`,
                        handler: `StaleWhileRevalidate`,
                        options: { cacheName: `gutenberg-catalog` }
                    }
                ]
            }
        } )
    ],

    server: { port: 5173 },

    define: {
        'process.env': {},
        'import.meta.env.VITE_COMMIT_HASH': JSON.stringify( commit_hash )
    }

} )
