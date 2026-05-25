import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { useRegisterSW as use_register_sw } from 'virtual:pwa-register/react'
import { log } from 'mentie'

export const PWA_UPDATE_BADGE_TEXT = `New version available, click here to update`
export const PWA_UPDATING_STATUS_TEXT = `Updating...`
export const PWA_UPDATE_RELOAD_FALLBACK_MS = 8_000

const BadgeButton = styled.button`
    position: fixed;
    right: calc(var(--space-m) + env(safe-area-inset-right));
    /* Clear the reader footer and bottom-center toast stack. */
    bottom: calc(var(--space-xl) + 4.5rem + env(safe-area-inset-bottom));
    z-index: 180;
    max-width: min(28rem, calc(100vw - var(--space-m) * 2));
    padding: var(--space-s) var(--space-m);
    border: 1px solid var(--accent-dark);
    border-radius: 999px;
    background: var(--accent);
    color: #102027;
    box-shadow: var(--shadow-m);
    font-weight: 700;
    line-height: 1.3;
    text-align: center;
    transition: filter 0.15s ease, transform 0.15s ease;

    &:hover {
        filter: brightness(0.95);
        transform: translateY(-1px);
    }

    &:focus-visible {
        outline: 3px solid var(--text);
        outline-offset: 3px;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.8;
        transform: none;
    }

    @media (max-width: 520px) {
        right: var(--space-m);
        left: var(--space-m);
        max-width: none;
        width: auto;
    }
`

const StatusText = styled.span`
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
`

/**
 * Visible update prompt for an available service worker version.
 * @param {Object} props
 * @param {boolean} props.need_refresh
 * @param {boolean} props.updating
 * @param {Function} props.update_app
 * @returns {JSX.Element|null}
 */
export function PWAUpdatePrompt( { need_refresh, updating, update_app } ) {

    if( !need_refresh ) return null

    const status_text = updating ? PWA_UPDATING_STATUS_TEXT : PWA_UPDATE_BADGE_TEXT

    return <>
        <StatusText role="status">{ status_text }</StatusText>
        <BadgeButton
            type="button"
            onClick={ update_app }
            disabled={ updating }
            aria-busy={ updating ? `true` : undefined }
        >
            { status_text }
        </BadgeButton>
    </>

}

/**
 * Shows a user-controlled app update prompt when the PWA service worker has a waiting version.
 * @param {Object} props
 * @param {Function} [props.register_sw_hook]
 * @param {Function} [props.reload_app]
 * @param {number} [props.reload_fallback_ms]
 * @returns {JSX.Element|null}
 */
export default function PWAUpdateBadge( {
    register_sw_hook = use_register_sw,
    reload_app = () => window.location.reload(),
    reload_fallback_ms = PWA_UPDATE_RELOAD_FALLBACK_MS
} = {} ) {

    const [ updating, set_updating ] = useState( false )
    const reload_timer_ref = useRef( null )
    const {
        needRefresh: [ need_refresh ],
        updateServiceWorker
    } = register_sw_hook( {
        onRegisterError: error => log.error( `Could not register service worker:`, error )
    } )

    const clear_reload_fallback = () => {
        if( !reload_timer_ref.current ) return
        clearTimeout( reload_timer_ref.current )
        reload_timer_ref.current = null
    }

    const update_app = async () => {

        set_updating( true )
        clear_reload_fallback()

        reload_timer_ref.current = setTimeout( () => {
            reload_app()
            set_updating( false )
            reload_timer_ref.current = null
        }, reload_fallback_ms )

        try {
            await updateServiceWorker()
        } catch ( error ) {
            clear_reload_fallback()
            log.error( `Could not update service worker:`, error )
            set_updating( false )
        }

    }

    useEffect( () => clear_reload_fallback, [] )

    return <PWAUpdatePrompt
        need_refresh={ need_refresh }
        updating={ updating }
        update_app={ update_app }
    />

}
