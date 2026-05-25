import { test, expect } from '@playwright/test'

test.describe( `PWA updates`, () => {

    test( `update badge is hidden during normal startup`, async ( { page } ) => {

        await page.goto( `/` )

        await expect( page.getByRole( `button`, { name: /new version available/i } ) ).not.toBeVisible()

    } )

    test( `update badge is wired to prompt-mode service worker updates`, async () => {

        const { readFileSync } = await import( `fs` )
        const vite_config = readFileSync( `./vite.config.js`, `utf-8` )
        const app = readFileSync( `./src/App.jsx`, `utf-8` )
        const badge = readFileSync( `./src/components/molecules/PWAUpdateBadge.jsx`, `utf-8` )

        expect( vite_config ).toContain( `registerType: \`prompt\`` )
        expect( vite_config ).not.toContain( `registerType: \`autoUpdate\`` )
        expect( app ).toContain( `<PWAUpdateBadge />` )
        expect( badge ).toContain( `useRegisterSW` )
        expect( badge ).toContain( `needRefresh` )
        expect( badge ).toContain( `updateServiceWorker` )
        expect( badge ).toContain( `New version available, click here to update` )

    } )

} )
