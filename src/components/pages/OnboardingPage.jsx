import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { validate_api_key } from '../../modules/open_router.js'
import { use_settings_store } from '../../stores/settings_store.js'

const Container = styled.div`
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
`

const Card = styled.div`
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    padding: var(--space-2xl);
    max-width: 420px;
    width: 100%;
    box-shadow: var(--shadow-l);
    text-align: center;
`

const AppTitle = styled.h1`
    color: var(--accent);
    margin-bottom: var(--space-s);
`

const Subtitle = styled.p`
    color: var(--text-muted);
    margin-bottom: var(--space-2xl);
    line-height: 1.6;
`

const Input = styled.input`
    width: 100%;
    padding: var(--space-m);
    border: 2px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--bg);
    color: var(--text);
    font-size: 0.95em;
    outline: none;
    margin-bottom: var(--space-l);
    transition: border-color 0.2s ease;

    &:focus {
        border-color: var(--accent);
    }

    &::placeholder {
        color: var(--text-muted);
    }
`

const Button = styled.button`
    width: 100%;
    padding: var(--space-m);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-m);
    font-size: 1em;
    font-weight: 600;
    min-height: 48px;
    transition: background 0.2s ease;

    &:hover:not(:disabled) {
        background: var(--accent-dark);
    }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`

const StatusText = styled.p`
    color: var(--text-muted);
    font-size: 0.85em;
    margin-top: var(--space-m);
`

const HelpText = styled.p`
    font-size: 0.8em;
    color: var(--text-muted);
    margin-top: var(--space-l);
    line-height: 1.5;

    a {
        color: var(--accent);
    }
`

export default function OnboardingPage() {

    const navigate = useNavigate()
    const set_api_key = use_settings_store( state => state.set_api_key )

    // Auto-fill from env during development
    const env_key = import.meta.env.VITE_OPENROUTER_API_KEY || ``
    const [ key, set_key ] = useState( env_key )
    const [ loading, set_loading ] = useState( false )

    const connect = async () => {

        if( !key.trim() ) {
            toast.error( `Please enter an API key` )
            return
        }

        set_loading( true )

        try {
            const is_valid = await validate_api_key( key.trim() )

            if( is_valid ) {
                set_api_key( key.trim() )
                toast.success( `Connected!` )
                navigate( `/library` )
            } else {
                toast.error( `Invalid API key — please check and try again` )
            }

        } catch {
            toast.error( `Could not connect — check your internet connection` )
        } finally {
            set_loading( false )
        }

    }

    const handle_key_down = ( e ) => {
        if( e.key === `Enter` ) connect()
    }

    return <Container>
        <Card>

            <AppTitle>Gratis Reader</AppTitle>
            <Subtitle>
                Read any book in a new language, adapted to your level.
            </Subtitle>

            <Input
                type="password"
                placeholder="sk-or-..."
                value={ key }
                onChange={ ( e ) => set_key( e.target.value ) }
                onKeyDown={ handle_key_down }
                disabled={ loading }
                autoFocus
            />

            <Button onClick={ connect } disabled={ loading || !key.trim() }>
                { loading ? `Connecting...` : `Connect` }
            </Button>

            { loading && <StatusText role="status" aria-live="polite">
                Checking OpenRouter API key...
            </StatusText> }

            <HelpText>
                Enter your <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter API key</a> to get started.
                Your key stays in your browser — it's never sent to our servers.
            </HelpText>

        </Card>
    </Container>

}
