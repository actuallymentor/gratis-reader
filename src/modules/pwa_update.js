export const SERVICE_WORKER_SKIP_WAITING_MESSAGE = { type: `SKIP_WAITING` }
export const FORCE_UPDATE_RELOAD_DELAY_MS = 500

const get_service_worker_registrations = async () => {

    if( !( `serviceWorker` in navigator ) ) return []
    if( typeof navigator.serviceWorker.getRegistrations === `function` ) {
        return navigator.serviceWorker.getRegistrations()
    }

    const registration = await navigator.serviceWorker.getRegistration?.()
    return registration ? [ registration ] : []

}

const check_for_registration_update = async registration => {

    if( typeof registration?.update !== `function` ) return

    try {
        await registration.update()
    } catch {
        // Force update is a recovery path, so continue with the reset fallback.
    }

}

const clear_cache_storage = async () => {

    if( !( `caches` in window ) ) return 0

    const cache_names = await window.caches.keys()
    await Promise.all( cache_names.map( cache_name => window.caches.delete( cache_name ) ) )

    return cache_names.length

}

const schedule_reload_after_controller_change = ( { reload_app, reload_delay_ms } ) => {

    let did_reload = false
    let timer_id = null
    const service_worker = navigator.serviceWorker

    const reload_once = () => {
        if( did_reload ) return

        did_reload = true
        if( timer_id ) clearTimeout( timer_id )
        service_worker?.removeEventListener?.( `controllerchange`, reload_once )
        reload_app()
    }

    service_worker?.addEventListener?.( `controllerchange`, reload_once, { once: true } )
    timer_id = setTimeout( reload_once, reload_delay_ms )

}

/**
 * Forces the browser out of a stale PWA shell without clearing IndexedDB data.
 * @param {Object} options
 * @param {Function} [options.reload_app]
 * @param {number} [options.reload_delay_ms]
 * @returns {Promise<{mode: string, registrations: number, caches: number}>}
 */
export const force_pwa_update = async ( {
    reload_app = () => window.location.reload(),
    reload_delay_ms = FORCE_UPDATE_RELOAD_DELAY_MS
} = {} ) => {

    const registrations = await get_service_worker_registrations()

    await Promise.all( registrations.map( check_for_registration_update ) )

    const waiting_worker = registrations.find( registration => registration.waiting )?.waiting
    if( waiting_worker ) {
        waiting_worker.postMessage( SERVICE_WORKER_SKIP_WAITING_MESSAGE )
        schedule_reload_after_controller_change( { reload_app, reload_delay_ms } )
        return { mode: `waiting`, registrations: registrations.length, caches: 0 }
    }

    await Promise.all( registrations.map( registration => registration.unregister?.() ) )
    const caches_cleared = await clear_cache_storage()

    reload_app()

    return { mode: `reset`, registrations: registrations.length, caches: caches_cleared }

}
