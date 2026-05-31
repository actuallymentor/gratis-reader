import { createRoot } from 'react-dom/client'
import PWAUpdateBadge, {
    PWA_RELOAD_AUTO_UPDATE_STORAGE_KEY,
    PWAUpdatePrompt
} from '../../src/components/molecules/PWAUpdateBadge.jsx'

const mount = ( element ) => {
    const root_el = document.createElement( `div` )
    document.body.appendChild( root_el )
    createRoot( root_el ).render( element )
}

/**
 * Renders the stateless update prompt for browser-level accessibility checks.
 * @param {Object} options
 * @param {boolean} options.need_refresh
 * @param {boolean} options.updating
 */
export const mount_update_prompt = ( { need_refresh = true, updating = false } = {} ) => {
    window.__pwa_update_test = { prompt_clicks: 0 }

    mount( <PWAUpdatePrompt
        need_refresh={ need_refresh }
        updating={ updating }
        update_app={ () => {
            window.__pwa_update_test.prompt_clicks += 1
        } }
    /> )
}

/**
 * Renders the service-worker-backed badge with a fake registration hook.
 * @param {Object} options
 * @param {boolean} options.need_refresh
 * @param {boolean} options.reject_update
 * @param {number} options.reload_fallback_ms
 * @param {boolean} options.update_waiting_on_reload
 * @param {boolean} options.auto_update_already_applied
 * @param {number|null} options.auto_update_applied_at
 */
export const mount_update_badge = ( {
    need_refresh = true,
    reject_update = false,
    reload_fallback_ms = 20,
    update_waiting_on_reload = false,
    auto_update_already_applied = false,
    auto_update_applied_at = null
} = {} ) => {

    if( auto_update_applied_at !== null ) {
        sessionStorage.setItem( PWA_RELOAD_AUTO_UPDATE_STORAGE_KEY, String( auto_update_applied_at ) )
    } else if( auto_update_already_applied ) {
        sessionStorage.setItem( PWA_RELOAD_AUTO_UPDATE_STORAGE_KEY, String( Date.now() ) )
    } else {
        sessionStorage.removeItem( PWA_RELOAD_AUTO_UPDATE_STORAGE_KEY )
    }

    window.__pwa_update_test = {
        prompt_clicks: 0,
        update_calls: 0,
        reloads: 0,
        register_errors: 0,
        registration_update_calls: 0
    }

    const register_sw_hook = ( { onRegisteredSW, onRegisterError } = {} ) => {
        window.__pwa_update_test.register_errors += typeof onRegisterError === `function` ? 0 : 1

        if( typeof onRegisteredSW === `function` ) {
            setTimeout( () => {
                onRegisteredSW( `/sw.js`, {
                    update: async () => {
                        window.__pwa_update_test.registration_update_calls += 1
                    }
                } )
            }, 0 )
        }

        return {
            needRefresh: [ need_refresh, () => {} ],
            updateServiceWorker: async () => {
                window.__pwa_update_test.update_calls += 1
                if( reject_update ) throw new Error( `update failed` )
            }
        }
    }

    mount( <PWAUpdateBadge
        register_sw_hook={ register_sw_hook }
        reload_app={ () => {
            window.__pwa_update_test.reloads += 1
        } }
        reload_fallback_ms={ reload_fallback_ms }
        reload_auto_update_cooldown_ms={ 60_000 }
        should_apply_waiting_update={ () => update_waiting_on_reload }
    /> )

}
