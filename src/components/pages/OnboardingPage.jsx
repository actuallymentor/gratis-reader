import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled, { css } from 'styled-components'
import { AlertTriangle, BookOpen, Code, Loader2 } from 'lucide-react'
import { Button } from '../atoms/Button.jsx'
import HelpButton from '../molecules/HelpButton.jsx'
import use_attention from '../../hooks/use_attention.js'
import { HeroArt, LevelArt, PeekArt, ShelfArt } from '../molecules/LandingArt.jsx'
import toast from 'react-hot-toast'
import { KEY_FORMAT_HINT, looks_like_api_key, validate_api_key } from '../../modules/open_router.js'
import { use_settings_store } from '../../stores/settings_store.js'

/* ===============================
// Layout
// =============================== */

const Page = styled.div`
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
`

// Shared content width: header, hero, sections, separators and footer all align to it
const Width = styled.div`
    width: 100%;
    max-width: 72rem;
    margin: 0 auto;
    padding: 0 var(--space-m);

    @media (min-width: 600px) { padding: 0 var(--space-xl); }
`

const Header = styled( Width )`
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 4rem;
`

const Brand = styled.span`
    display: inline-flex;
    align-items: center;
    gap: var(--space-s);
    font-family: var(--font-heading);
    font-size: 1.125rem;

    svg { width: 1.25rem; height: 1.25rem; color: var(--accent); }
`

const HeaderLink = styled.a`
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    min-height: 2.75rem;
    padding: 0 var(--space-xs);
    color: var(--text-muted);
    font-size: 0.9375rem;
    text-decoration: none;

    svg { width: 1rem; height: 1rem; }
    &:hover { color: var(--text); text-decoration: underline; }
`

/* ===============================
// Hero
// =============================== */

// Mobile: centered introduction with a compact inset artwork above it. Desktop: text | artwork.
const Hero = styled( Width )`
    display: grid;
    gap: var(--space-xl);
    padding-top: var(--space-l);
    padding-bottom: var(--space-3xl);

    @media (min-width: 880px) {
        grid-template-columns: minmax( 0, 1fr ) minmax( 0, 1fr );
        align-items: center;
        gap: var(--space-3xl);
        padding-top: var(--space-2xl);
        padding-bottom: 5rem;
    }
`

const HeroText = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    @media (min-width: 880px) {
        align-items: flex-start;
        text-align: left;
    }
`

const HeroArtwork = styled.div`
    order: -1;
    width: 100%;
    max-width: 16rem;
    margin: 0 auto;

    @media (min-width: 880px) {
        order: 0;
        max-width: 30rem;
    }
`

const Headline = styled.h1`
    font-size: clamp( 2.25rem, 1.4rem + 3.2vw, 3.5rem );
    line-height: 1.12;
    letter-spacing: -0.01em;
    max-width: 14ch;

    @media (min-width: 880px) { max-width: 16ch; }
`

// Marker-style highlight: keeps body text colour, so contrast is unaffected by the accent
const Mark = styled.span`
    background: linear-gradient( transparent 58%, var(--accent-light) 58%, var(--accent-light) 92%, transparent 92% );
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
`

const Lede = styled.p`
    margin-top: var(--space-m);
    max-width: 34rem;
    color: var(--text-muted);
    font-size: clamp( 1.0625rem, 1rem + 0.35vw, 1.25rem );
    line-height: 1.5;
`

/* ===============================
// Key form
// =============================== */

const Form = styled.form`
    width: 100%;
    max-width: 28rem;
    margin-top: var(--space-xl);
    padding: var(--space-l);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    box-shadow: var(--shadow-l);
    text-align: left;
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

const FormFooter = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-m);
    margin-top: var(--space-m);
`

const HelpText = styled.p`
    flex: 1 1 12rem;
    font-size: 0.85rem;
    color: var(--text-muted);
    line-height: 1.5;
`

const Spinner = styled( Loader2 )`
    animation: spin 1s linear infinite;
`

/* ===============================
// Feature sections
// =============================== */

// Thin rule across the full content width
const Rule = styled.hr`
    border: 0;
    border-top: 1px solid var(--border);
`

// Desktop alternates text and artwork sides; mobile stacks text first, artwork after
const Section = styled.section`
    display: grid;
    gap: var(--space-l);
    padding: var(--space-3xl) 0;
    align-items: center;

    @media (min-width: 880px) {
        grid-template-columns: minmax( 0, 1fr ) minmax( 0, 1fr );
        gap: var(--space-3xl);
        padding: 5rem 0;

        ${ p => p.$flip && css`& > :first-child { order: 2; }` }
    }
`

const SectionText = styled.div`
    max-width: 30rem;
`

const SectionArt = styled.div`
    width: 100%;
    max-width: 22rem;

    @media (min-width: 880px) {
        max-width: 26rem;
        justify-self: center;
    }
`

const SectionTitle = styled.h2`
    font-size: clamp( 1.5rem, 1.1rem + 1.4vw, 2.125rem );
    line-height: 1.2;
`

const SectionBody = styled.p`
    margin-top: var(--space-m);
    color: var(--text-muted);
    line-height: 1.6;
    max-width: 65ch;
`

const Footer = styled( Width )`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-s) var(--space-l);
    margin-top: auto;
    padding-top: var(--space-l);
    padding-bottom: var(--space-l);
    color: var(--text-muted);
    font-size: 0.875rem;
`

const SECTIONS = [
    {
        title: `Rewritten, not just translated`,
        body: `Each sentence is rewritten for your level, from first words to fluent. Simpler vocabulary and grammar while you learn, the full texture once you are ready for it.`,
        Art: LevelArt,
    },
    {
        title: `Tap to peek`,
        body: `Tap a sentence to see the original. Tap a word for its meaning. Long press to ask why it was translated that way.`,
        Art: PeekArt,
    },
    {
        title: `Your shelf, in your browser`,
        body: `Drop in any EPUB or open one of 1,857 public domain classics. No accounts and no tracking: books, key and translations are stored on this device. Only the text being translated goes to OpenRouter.`,
        Art: ShelfArt,
    },
]

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

    // Connect is the next important action once a plausible key is in and typing has paused
    const attention = use_attention( looks_like_api_key( key ) && !error && !loading, key )

    const submit = ( e ) => {
        e.preventDefault()
        if( !loading ) connect()
    }

    return <Page>

        <Header as="header">
            <Brand>
                <BookOpen strokeWidth={ 1.5 } aria-hidden="true" />
                Gratis Reader
            </Brand>
            <HeaderLink href="https://github.com/actuallymentor/gratis-reader" target="_blank" rel="noopener noreferrer">
                <Code strokeWidth={ 1.5 } aria-hidden="true" />
                Source
            </HeaderLink>
        </Header>

        <main>

            <Hero>

                <HeroText>

                    <Headline>Read any book in <Mark>the language you&apos;re learning</Mark></Headline>
                    <Lede>Every sentence rewritten for your level. Tap for the original, tap a word for its meaning.</Lede>

                    <Form onSubmit={ submit } noValidate aria-label="Connect OpenRouter">

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
                            autoComplete="off"
                            placeholder="sk-or-..."
                            value={ key }
                            $invalid={ !!error }
                            aria-invalid={ !!error }
                            aria-describedby={ error ? `openrouter-key-error` : `openrouter-key-help` }
                            onChange={ ( e ) => {
                                set_key( e.target.value )
                                if( error ) set_error( null )
                            } }
                            disabled={ loading }
                        />
                        { error && <FieldError id="openrouter-key-error" role="alert">
                            <AlertTriangle strokeWidth={ 1.5 } aria-hidden="true" />
                            { error }
                        </FieldError> }

                        <FormFooter>
                            <HelpText id="openrouter-key-help">
                                Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a>. It stays in your browser.
                            </HelpText>
                            <Button type="submit" variant="primary" attention={ attention } disabled={ loading || !key.trim() } icon={ loading ? <Spinner strokeWidth={ 1.5 } /> : null }>
                                { loading ? `Connecting…` : `Connect` }
                            </Button>
                        </FormFooter>

                        { loading && <span className="visually-hidden" role="status" aria-live="polite">
                            Checking OpenRouter API key...
                        </span> }

                    </Form>

                </HeroText>

                <HeroArtwork><HeroArt /></HeroArtwork>

            </Hero>

            <Width>
                { SECTIONS.map( ( { title, body, Art }, index ) => <Fragment key={ title }>
                    <Rule />
                    <Section $flip={ index % 2 === 0 } aria-labelledby={ `feature-${ index }` }>
                        <SectionText>
                            <SectionTitle id={ `feature-${ index }` }>{ title }</SectionTitle>
                            <SectionBody>{ body }</SectionBody>
                        </SectionText>
                        <SectionArt><Art /></SectionArt>
                    </Section>
                </Fragment> ) }
                <Rule />
            </Width>

        </main>

        <Footer as="footer">
            <span>Free and open source, MIT licensed.</span>
            <span>Bring your own <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer">OpenRouter</a> key.</span>
        </Footer>

    </Page>

}
