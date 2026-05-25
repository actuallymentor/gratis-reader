import { createRoot } from 'react-dom/client'
import PWAUpdateBadge, { PWAUpdatePrompt } from '../../src/components/molecules/PWAUpdateBadge.jsx'

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
 */
export const mount_update_badge = ( {
    need_refresh = true,
    reject_update = false,
    reload_fallback_ms = 20
} = {} ) => {

    window.__pwa_update_test = {
        prompt_clicks: 0,
        update_calls: 0,
        reloads: 0,
        register_errors: 0
    }

    const register_sw_hook = ( { onRegisterError } = {} ) => {
        window.__pwa_update_test.register_errors += typeof onRegisterError === `function` ? 0 : 1

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
    /> )

}
