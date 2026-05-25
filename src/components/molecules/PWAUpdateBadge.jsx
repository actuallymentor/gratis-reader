import { useState } from 'react'
import styled from 'styled-components'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { log } from 'mentie'

const BadgeButton = styled.button`
    position: fixed;
    right: calc(var(--space-m) + env(safe-area-inset-right));
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
        width: auto;
    }
`

/**
 * Shows a user-controlled app update prompt when the PWA service worker has a waiting version.
 * @returns {JSX.Element|null}
 */
export default function PWAUpdateBadge() {

    const [ updating, set_updating ] = useState( false )
    const {
        needRefresh: [ need_refresh ],
        updateServiceWorker
    } = useRegisterSW()

    const update_app = async () => {

        set_updating( true )

        try {
            await updateServiceWorker( true )
        } catch ( error ) {
            set_updating( false )
            log.error( `Could not update service worker:`, error )
        }

    }

    if( !need_refresh ) return null

    return <BadgeButton
        type="button"
        onClick={ update_app }
        disabled={ updating }
        aria-live="polite"
    >
        { updating ? `Updating...` : `New version available, click here to update` }
    </BadgeButton>

}
