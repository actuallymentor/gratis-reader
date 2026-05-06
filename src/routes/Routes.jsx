import { useEffect, useRef, useState } from 'react'
import { Routes as RouterRoutes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import toast from 'react-hot-toast'

import OnboardingPage from '../components/pages/OnboardingPage.jsx'
import LibraryPage from '../components/pages/LibraryPage.jsx'
import ReaderPage from '../components/pages/ReaderPage.jsx'
import { validate_api_key } from '../modules/open_router.js'
import { use_settings_store } from '../stores/settings_store.js'

const AuthLoadingContainer = styled.div`
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
`

const AuthLoadingPanel = styled.div`
    width: 100%;
    max-width: 360px;
    padding: var(--space-xl);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-m);
    text-align: center;
`

const Spinner = styled.div`
    width: 36px;
    height: 36px;
    margin: 0 auto var(--space-m);
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`

const AuthLoadingText = styled.p`
    color: var(--text-muted);
`

const FRAGMENT_API_KEY = `openrouter_api_key`

const get_fragment_api_key = ( hash ) => {

    const fragment = hash.replace( /^#/, `` )
    return new URLSearchParams( fragment ).get( FRAGMENT_API_KEY )?.trim() || ``

}

const has_query_api_key = ( search ) => new URLSearchParams( search ).has( FRAGMENT_API_KEY )

const get_clean_location = ( location ) => {

    const search_params = new URLSearchParams( location.search )
    search_params.delete( FRAGMENT_API_KEY )

    const search = search_params.toString()
    if( !get_fragment_api_key( location.hash ) ) {
        return `${ location.pathname }${ search ? `?${ search }` : `` }${ location.hash }`
    }

    const fragment = location.hash.replace( /^#/, `` )
    const hash_params = new URLSearchParams( fragment )
    hash_params.delete( FRAGMENT_API_KEY )

    const hash = hash_params.toString()
    return `${ location.pathname }${ search ? `?${ search }` : `` }${ hash ? `#${ hash }` : `` }`

}

const FragmentKeyLoading = () => <AuthLoadingContainer>
    <AuthLoadingPanel role="status" aria-live="polite" aria-busy="true">
        <Spinner aria-hidden="true" />
        <AuthLoadingText>Checking OpenRouter API key...</AuthLoadingText>
    </AuthLoadingPanel>
</AuthLoadingContainer>

export default function Routes() {

    const location = useLocation()
    const navigate = useNavigate()
    const api_key = use_settings_store( state => state.api_key )
    const set_api_key = use_settings_store( state => state.set_api_key )
    const [ checking_fragment_key, set_checking_fragment_key ] = useState( false )
    const processed_fragment = useRef( null )

    const fragment_api_key = get_fragment_api_key( location.hash )
    const query_has_api_key = has_query_api_key( location.search )

    useEffect( () => {
        if( fragment_api_key || !query_has_api_key ) return
        navigate( get_clean_location( location ), { replace: true } )
    }, [ fragment_api_key, location, navigate, query_has_api_key ] )

    useEffect( () => {

        if( !fragment_api_key ) {
            processed_fragment.current = null
            return
        }

        if( processed_fragment.current === location.hash ) return
        processed_fragment.current = location.hash

        const clean_location = get_clean_location( location )

        // Fragments are not sent to the server, and this removes the key from
        // browser chrome before validation or persistence.
        window.history.replaceState( window.history.state, document.title, clean_location )

        const validate_fragment_key = async () => {

            set_checking_fragment_key( true )

            try {
                const is_valid = await validate_api_key( fragment_api_key )

                if( is_valid ) {
                    set_api_key( fragment_api_key )
                    toast.success( `Connected!` )
                    navigate( location.pathname === `/` ? `/library` : clean_location, { replace: true } )
                    return
                }

                toast.error( `Invalid API key — please check and try again` )
                navigate( clean_location, { replace: true } )

            } catch {
                toast.error( `Could not connect — check your internet connection` )
                navigate( clean_location, { replace: true } )
            } finally {
                set_checking_fragment_key( false )
            }

        }

        validate_fragment_key()

    }, [ fragment_api_key, location, navigate, set_api_key ] )

    if( fragment_api_key || checking_fragment_key ) return <FragmentKeyLoading />

    return <RouterRoutes>

        { /* Redirect to library if already onboarded */ }
        <Route path="/" element={ api_key ? <Navigate to="/library" replace /> : <OnboardingPage /> } />
        <Route path="/library" element={ api_key ? <LibraryPage /> : <Navigate to="/" replace /> } />
        <Route path="/read/:book_id" element={ api_key ? <ReaderPage /> : <Navigate to="/" replace /> } />

        { /* Catch-all — redirect unknown routes */ }
        <Route path="*" element={ <Navigate to="/" replace /> } />

    </RouterRoutes>

}
