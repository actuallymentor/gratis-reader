import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '../atoms/Button.jsx'
import HelpButton from '../molecules/HelpButton.jsx'
import toast from 'react-hot-toast'
import { KEY_FORMAT_HINT, looks_like_api_key, validate_api_key } from '../../modules/open_router.js'
import { use_settings_store } from '../../stores/settings_store.js'

const Container = styled.div`
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-m);
`

const Card = styled.div`
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    padding: var(--space-xl) var(--space-l);
    max-width: 26rem;
    width: 100%;
    box-shadow: var(--shadow-m);

    @media (min-width: 600px) { padding: var(--space-2xl); }
`

const AppTitle = styled.h1`
    color: var(--accent);
    font-size: 1.75rem;
    margin-bottom: var(--space-xs);
`

const Subtitle = styled.p`
    color: var(--text-muted);
    margin-bottom: var(--space-xl);
    line-height: 1.5;
`

const LabelRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-xs);
`

const Label = styled.label`
    font-size: 0.9rem;
    font-weight: 500;
`

const Input = styled.input`
    width: 100%;
    min-height: 2.75rem;
    padding: var(--space-s) var(--space-m);
    border: 1px solid ${ p => p.$invalid ? `var(--danger)` : `var(--border)` };
    border-radius: var(--radius-m);
    background: var(--field-bg);
    color: var(--text);
    font: inherit;
    font-size: 0.95rem;
    transition: border-color var(--duration-press) ease;

    &:focus-visible { border-color: ${ p => p.$invalid ? `var(--danger)` : `var(--accent)` }; }
    &::placeholder { color: var(--text-muted); }
`

const FieldError = styled.p`
    display: flex;
    align-items: flex-start;
    gap: var(--space-xs);
    margin-top: var(--space-s);
    padding: var(--space-s) var(--space-m);
    border-radius: var(--radius-m);
    background: var(--danger-tint);
    color: var(--danger);
    font-size: 0.85rem;
    line-height: 1.4;

    svg { width: 1rem; height: 1rem; flex-shrink: 0; margin-top: 0.1rem; }
`

const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-l);
`

const Spinner = styled( Loader2 )`
    animation: spin 1s linear infinite;
`

const HelpText = styled.p`
    font-size: 0.85rem;
    color: var(--text-muted);
    margin-top: var(--space-l);
    line-height: 1.5;
`

const VALIDATE_DEBOUNCE_MS = 800

export default function OnboardingPage() {

    const navigate = useNavigate()
    const set_api_key = use_settings_store( state => state.set_api_key )

    // Auto-fill from env during development
    const env_key = import.meta.env.VITE_OPENROUTER_API_KEY || ``
    const [ key, set_key ] = useState( env_key )
    const [ loading, set_loading ] = useState( false )
    const [ error, set_error ] = useState( null )

    // Debounced shape check once typing pauses; a wrong-shaped key gets a hint, not a request
    useEffect( () => {
        const timer = setTimeout( () => {
            if( key.trim() && !looks_like_api_key( key ) ) set_error( KEY_FORMAT_HINT )
            else set_error( current => current === KEY_FORMAT_HINT ? null : current )
        }, VALIDATE_DEBOUNCE_MS )
        return () => clearTimeout( timer )
    }, [ key ] )

    const connect = async () => {

        if( !key.trim() ) {
            set_error( `Please enter an API key` )
            return
        }

        set_loading( true )
        set_error( null )

        try {
            const is_valid = await validate_api_key( key.trim() )

            if( is_valid ) {
                set_api_key( key.trim() )
                toast.success( `Connected!` )
                navigate( `/library` )
            } else {
                set_error( `Invalid API key — please check and try again` )
            }

        } catch {
            set_error( `Could not connect — check your internet connection` )
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

            <LabelRow>
                <Label htmlFor="openrouter-key">OpenRouter API key</Label>
                <HelpButton title="Why an OpenRouter key?" topic="the API key">
                    <p>Translations come from AI models on OpenRouter. Your key lets Gratis Reader call them on your account, so you pay OpenRouter directly for what you read, usually fractions of a cent per page.</p>
                    <p>The key is stored only in this browser and sent only to OpenRouter. Create one at openrouter.ai/keys.</p>
                </HelpButton>
            </LabelRow>
            <Input
                id="openrouter-key"
                type="password"
                placeholder="sk-or-..."
                value={ key }
                $invalid={ !!error }
                aria-invalid={ !!error }
                aria-describedby={ error ? `openrouter-key-error` : undefined }
                onChange={ ( e ) => {
                    set_key( e.target.value )
                    if( error ) set_error( null )
                } }
                onKeyDown={ handle_key_down }
                disabled={ loading }
                autoFocus
            />
            { error && <FieldError id="openrouter-key-error" role="alert">
                <AlertTriangle strokeWidth={ 1.5 } aria-hidden="true" />
                { error }
            </FieldError> }

            <Actions>
                <Button variant="primary" onClick={ connect } disabled={ loading || !key.trim() } icon={ loading ? <Spinner strokeWidth={ 1.5 } /> : null }>
                    { loading ? `Connecting…` : `Connect` }
                </Button>
            </Actions>

            { loading && <span className="visually-hidden" role="status" aria-live="polite">
                Checking OpenRouter API key...
            </span> }

            <HelpText>
                Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a>.
                It stays in your browser and is never sent to our servers.
            </HelpText>

        </Card>
    </Container>

}
