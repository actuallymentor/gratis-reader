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

const QUERY_API_KEY = `openrouter_api_key`

const get_query_api_key = ( search ) => new URLSearchParams( search ).get( QUERY_API_KEY )?.trim() || ``

const get_clean_location = ( location ) => {

    const params = new URLSearchParams( location.search )
    params.delete( QUERY_API_KEY )

    const search = params.toString()
    return `${ location.pathname }${ search ? `?${ search }` : `` }${ location.hash }`

}

const QueryKeyLoading = () => <AuthLoadingContainer>
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
    const [ checking_query_key, set_checking_query_key ] = useState( false )
    const processed_query = useRef( null )

    const query_api_key = get_query_api_key( location.search )

    useEffect( () => {

        if( !query_api_key ) {
            processed_query.current = null
            return
        }

        if( processed_query.current === location.search ) return
        processed_query.current = location.search

        const clean_location = get_clean_location( location )

        // Remove the key from browser chrome immediately, then validate before
        // trusting it enough to persist.
        window.history.replaceState( window.history.state, document.title, clean_location )

        const validate_query_key = async () => {

            set_checking_query_key( true )

            try {
                const is_valid = await validate_api_key( query_api_key )

                if( is_valid ) {
                    set_api_key( query_api_key )
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
                set_checking_query_key( false )
            }

        }

        validate_query_key()

    }, [ location, navigate, query_api_key, set_api_key ] )

    if( query_api_key || checking_query_key ) return <QueryKeyLoading />

    return <RouterRoutes>

        { /* Redirect to library if already onboarded */ }
        <Route path="/" element={ api_key ? <Navigate to="/library" replace /> : <OnboardingPage /> } />
        <Route path="/library" element={ api_key ? <LibraryPage /> : <Navigate to="/" replace /> } />
        <Route path="/read/:book_id" element={ api_key ? <ReaderPage /> : <Navigate to="/" replace /> } />

        { /* Catch-all — redirect unknown routes */ }
        <Route path="*" element={ <Navigate to="/" replace /> } />

    </RouterRoutes>

}
