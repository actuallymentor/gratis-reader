import { test, expect } from '@playwright/test'

const mount_update_prompt = async ( page, options ) => {
    await page.evaluate( async ( mount_options ) => {
        const { mount_update_prompt } = await import( `/tests/fixtures/pwa_update_harness.jsx` )
        mount_update_prompt( mount_options )
    }, options )
}

const mount_update_badge = async ( page, options ) => {
    await page.evaluate( async ( mount_options ) => {
        const { mount_update_badge } = await import( `/tests/fixtures/pwa_update_harness.jsx` )
        mount_update_badge( mount_options )
    }, options )
}

test.describe( `PWA updates`, () => {

    test.beforeEach( async ( { page } ) => {
        await page.goto( `/` )
    } )

    test.afterEach( async ( { page } ) => {
        await page.evaluate( () => {
            const descriptor = Object.getOwnPropertyDescriptor( Navigator.prototype, `serviceWorker` )
            if( descriptor?.configurable ) delete Navigator.prototype.serviceWorker
        } ).catch( () => {} )
    } )

    test( `renders an accessible update badge when a version is waiting`, async ( { page } ) => {

        await mount_update_prompt( page, { need_refresh: true, updating: false } )

        const update_button = page.getByRole( `button`, { name: `New version available, click here to update` } )
        await expect( update_button ).toBeVisible()
        await expect( update_button ).not.toHaveAttribute( `aria-live` )
        await expect( page.getByRole( `status` ) ).toHaveText( `New version available, click here to update` )

    } )

    test( `announces updating state without aria-live on the button`, async ( { page } ) => {

        await mount_update_prompt( page, { need_refresh: true, updating: true } )

        const update_button = page.getByRole( `button`, { name: `Updating...` } )
        await expect( update_button ).toBeVisible()
        await expect( update_button ).toBeDisabled()
        await expect( update_button ).toHaveAttribute( `aria-busy`, `true` )
        await expect( update_button ).not.toHaveAttribute( `aria-live` )
        await expect( page.getByRole( `status` ) ).toHaveText( `Updating...` )

    } )

    test( `clicking the badge runs the service worker update and fallback reload`, async ( { page } ) => {

        await mount_update_badge( page, { need_refresh: true, reload_fallback_ms: 500 } )

        await page.getByRole( `button`, { name: `New version available, click here to update` } ).click()

        await expect( page.getByRole( `button`, { name: `Updating...` } ) ).toBeDisabled()
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.update_calls ) ).toBe( 1 )
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.reloads ) ).toBe( 1 )
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.register_errors ) ).toBe( 0 )

    } )

    test( `reloads can automatically apply a waiting service worker`, async ( { page } ) => {

        await mount_update_badge( page, {
            need_refresh: true,
            reload_fallback_ms: 500,
            update_waiting_on_reload: true
        } )

        await expect( page.getByRole( `button`, { name: `Updating...` } ) ).toBeDisabled()
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.update_calls ) ).toBe( 1 )
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.reloads ) ).toBe( 1 )

    } )

    test( `reload auto-apply is throttled after one recovery attempt`, async ( { page } ) => {

        await mount_update_badge( page, {
            need_refresh: true,
            reload_fallback_ms: 500,
            update_waiting_on_reload: true,
            auto_update_already_applied: true
        } )

        await expect( page.getByRole( `button`, { name: `New version available, click here to update` } ) ).toBeVisible()
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.update_calls ) ).toBe( 0 )
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.reloads ) ).toBe( 0 )

    } )

    test( `reload auto-apply ignores invalid future cooldown timestamps`, async ( { page } ) => {

        await mount_update_badge( page, {
            need_refresh: true,
            reload_fallback_ms: 500,
            update_waiting_on_reload: true,
            auto_update_applied_at: Date.now() + 60_000
        } )

        await expect( page.getByRole( `button`, { name: `Updating...` } ) ).toBeDisabled()
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.update_calls ) ).toBe( 1 )
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.reloads ) ).toBe( 1 )

    } )

    test( `registration checks for service worker updates after mounting`, async ( { page } ) => {

        await mount_update_badge( page, { need_refresh: false } )

        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.registration_update_calls ) ).toBe( 1 )

    } )

    test( `failed service worker update re-enables the badge`, async ( { page } ) => {

        await page.evaluate( () => {
            console.error = () => {}
        } )
        await mount_update_badge( page, { need_refresh: true, reject_update: true } )

        await page.getByRole( `button`, { name: `New version available, click here to update` } ).click()

        const update_button = page.getByRole( `button`, { name: `New version available, click here to update` } )
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.update_calls ) ).toBe( 1 )
        await expect( update_button ).toBeEnabled()
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.reloads ) ).toBe( 0 )

    } )

    test( `force update activates a waiting service worker`, async ( { page } ) => {

        await page.evaluate( async () => {
            const calls = {
                cache_deletes: [],
                messages: [],
                reloads: 0,
                unregisters: 0,
                updates: 0
            }
            const waiting_worker = {
                postMessage: message => calls.messages.push( message )
            }
            const registration = {
                waiting: waiting_worker,
                update: async () => {
                    calls.updates += 1
                },
                unregister: async () => {
                    calls.unregisters += 1
                }
            }

            Object.defineProperty( Navigator.prototype, `serviceWorker`, {
                configurable: true,
                get: () => ( {
                    getRegistrations: async () => [ registration ]
                } )
            } )
            Object.defineProperty( window, `caches`, {
                configurable: true,
                value: {
                    keys: async () => [ `workbox-precache` ],
                    delete: async cache_name => {
                        calls.cache_deletes.push( cache_name )
                        return true
                    }
                }
            } )

            const { force_pwa_update } = await import( `/src/modules/pwa_update.js` )
            const result = await force_pwa_update( {
                reload_app: () => {
                    calls.reloads += 1
                },
                reload_delay_ms: 0
            } )

            await new Promise( resolve => setTimeout( resolve, 0 ) )
            window.__force_pwa_update_test = { calls, result }
        } )

        const { calls, result } = await page.evaluate( () => window.__force_pwa_update_test )
        expect( result.mode ).toBe( `waiting` )
        expect( calls.updates ).toBe( 1 )
        expect( calls.messages ).toEqual( [ { type: `SKIP_WAITING` } ] )
        expect( calls.unregisters ).toBe( 0 )
        expect( calls.cache_deletes ).toEqual( [] )
        expect( calls.reloads ).toBe( 1 )

    } )

    test( `force update reloads as soon as the waiting worker takes control`, async ( { page } ) => {

        await page.evaluate( async () => {
            const calls = {
                messages: [],
                reloads: 0,
                updates: 0
            }
            const service_worker = new EventTarget()
            service_worker.getRegistrations = async () => [ {
                waiting: {
                    postMessage: message => calls.messages.push( message )
                },
                update: async () => {
                    calls.updates += 1
                }
            } ]

            Object.defineProperty( Navigator.prototype, `serviceWorker`, {
                configurable: true,
                get: () => service_worker
            } )

            const { force_pwa_update } = await import( `/src/modules/pwa_update.js` )
            const result = await force_pwa_update( {
                reload_app: () => {
                    calls.reloads += 1
                },
                reload_delay_ms: 10_000
            } )

            service_worker.dispatchEvent( new Event( `controllerchange` ) )
            service_worker.dispatchEvent( new Event( `controllerchange` ) )

            window.__force_pwa_update_test = { calls, result }
        } )

        const { calls, result } = await page.evaluate( () => window.__force_pwa_update_test )
        expect( result.mode ).toBe( `waiting` )
        expect( calls.updates ).toBe( 1 )
        expect( calls.messages ).toEqual( [ { type: `SKIP_WAITING` } ] )
        expect( calls.reloads ).toBe( 1 )

    } )

    test( `force update resets app shell caches when no worker is waiting`, async ( { page } ) => {

        await page.evaluate( async () => {
            const calls = {
                cache_deletes: [],
                reloads: 0,
                unregisters: 0,
                updates: 0
            }
            const registration = {
                waiting: null,
                update: async () => {
                    calls.updates += 1
                },
                unregister: async () => {
                    calls.unregisters += 1
                }
            }

            Object.defineProperty( Navigator.prototype, `serviceWorker`, {
                configurable: true,
                get: () => ( {
                    getRegistrations: async () => [ registration ]
                } )
            } )
            Object.defineProperty( window, `caches`, {
                configurable: true,
                value: {
                    keys: async () => [ `workbox-precache`, `google-fonts-webfonts` ],
                    delete: async cache_name => {
                        calls.cache_deletes.push( cache_name )
                        return true
                    }
                }
            } )

            const { force_pwa_update } = await import( `/src/modules/pwa_update.js` )
            const result = await force_pwa_update( {
                reload_app: () => {
                    calls.reloads += 1
                }
            } )

            window.__force_pwa_update_test = { calls, result }
        } )

        const { calls, result } = await page.evaluate( () => window.__force_pwa_update_test )
        expect( result.mode ).toBe( `reset` )
        expect( calls.updates ).toBe( 1 )
        expect( calls.unregisters ).toBe( 1 )
        expect( calls.cache_deletes ).toEqual( [ `workbox-precache`, `google-fonts-webfonts` ] )
        expect( calls.reloads ).toBe( 1 )

    } )

    test( `PWA config uses a single prompt registration path`, async () => {

        const { readFileSync } = await import( `fs` )
        const vite_config = readFileSync( `./vite.config.js`, `utf-8` )

        expect( vite_config ).toContain( `registerType: \`prompt\`` )
        expect( vite_config ).toContain( `injectRegister: null` )
        expect( vite_config ).not.toContain( `registerType: \`autoUpdate\`` )

    } )

} )
