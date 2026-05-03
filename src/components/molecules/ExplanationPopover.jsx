import { useState, useEffect, useMemo } from 'react'
import styled from 'styled-components'
import { marked } from 'marked'
import { chat_completion } from '../../modules/open_router.js'
import { build_explanation_prompt, DEFAULT_LEVEL, LEVELS } from '../../modules/prompts.js'
import { use_settings_store } from '../../stores/settings_store.js'
import { SkeletonParagraph } from '../atoms/Skeleton.jsx'
import { log } from 'mentie'

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 200;
    animation: fade_in 0.2s ease;

    @keyframes fade_in {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @media (min-width: 768px) {
        align-items: center;
    }
`

const Panel = styled.div`
    background: var(--bg-surface);
    border-radius: var(--radius-l) var(--radius-l) 0 0;
    padding: var(--space-xl);
    max-height: 80vh;
    overflow-y: auto;
    width: 100%;
    max-width: min( 900px, calc( 100vw - var(--space-xl) * 2 ) );
    animation: slide_up 0.3s ease-out;

    @keyframes slide_up {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
    }

    @media (min-width: 768px) {
        border-radius: var(--radius-l);
        animation: scale_in 0.25s ease-out;

        @keyframes scale_in {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
    }
`

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-l);
`

const Title = styled.h3`
    font-size: 1.1em;
    color: var(--text);
`

const CloseButton = styled.button`
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.5em;
    line-height: 1;
    padding: var(--space-xs);
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-s);

    &:hover {
        background: var(--bg-hover);
        color: var(--text);
    }
`

const SentenceBlock = styled.div`
    background: var(--bg-hover);
    padding: var(--space-m);
    border-radius: var(--radius-m);
    margin-bottom: var(--space-m);
    line-height: 1.6;
`

const Label = styled.span`
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    display: block;
    margin-bottom: var(--space-xs);
`

const ExplanationText = styled.div`
    line-height: 1.8;
    color: var(--text);

    h1, h2, h3, h4 {
        margin: 0.8em 0 0.4em;
        font-size: 1.05em;
        font-weight: 600;
    }

    p { margin: 0.4em 0; }

    ul, ol {
        padding-left: 1.4em;
        margin: 0.4em 0;
    }

    li { margin: 0.2em 0; }

    code {
        background: var(--bg-hover);
        padding: 0.1em 0.3em;
        border-radius: 3px;
        font-size: 0.9em;
    }

    strong { font-weight: 600; }
`

/**
 * Explanation popover for long-press on a sentence
 * @param {Object} props
 * @param {string} props.original
 * @param {string} props.translated
 * @param {string} props.source_language
 * @param {string} props.target_language
 * @param {Function} props.on_close
 */
export default function ExplanationPopover( { original, translated, source_language, target_language, on_close } ) {

    const [ explanation, set_explanation ] = useState( null )
    const [ loading, set_loading ] = useState( true )
    const api_key = use_settings_store( state => state.api_key )
    const model = use_settings_store( state => state.model )
    const last_level = use_settings_store( state => state.last_level )

    const level_info = LEVELS.find( l => l.code === last_level ) || DEFAULT_LEVEL

    const rendered_html = useMemo( () => {
        if( !explanation ) return ``
        return marked.parse( explanation, { breaks: true } )
    }, [ explanation ] )

    // Fetch explanation on mount
    useEffect( () => {

        let cancelled = false
        const controller = new AbortController()

        const fetch_explanation = async () => {
            try {
                const { system, user } = build_explanation_prompt(
                    source_language, target_language, level_info.label,
                    original, translated
                )

                const { content } = await chat_completion( {
                    api_key, model,
                    system_prompt: system,
                    user_message: user,
                    temperature: 0.7,
                    signal: controller.signal
                } )

                if( !cancelled ) set_explanation( content )
            } catch ( error ) {
                if( !cancelled && error.name !== `AbortError` ) {
                    set_explanation( `Failed to generate explanation. Please try again.` )
                    log.error( `Error fetching explanation:`, error )
                }
            } finally {
                if( !cancelled ) set_loading( false )
            }
        }

        fetch_explanation()
        return () => {
            cancelled = true; controller.abort() 
        }

    }, [ original, translated, source_language, target_language, api_key, model, level_info ] )

    // Close on Escape
    useEffect( () => {
        const handle_key = ( e ) => {
            if( e.key === `Escape` ) on_close()
        }
        window.addEventListener( `keydown`, handle_key )
        return () => window.removeEventListener( `keydown`, handle_key )
    }, [ on_close ] )

    return <Overlay onClick={ ( e ) => {
        if( e.target === e.currentTarget ) on_close() 
    } }
    >
        <Panel>

            <Header>
                <Title>Translation Explanation</Title>
                <CloseButton onClick={ on_close } aria-label="Close">×</CloseButton>
            </Header>

            <SentenceBlock>
                <Label>Original</Label>
                { original }
            </SentenceBlock>

            <SentenceBlock>
                <Label>Translation</Label>
                { translated }
            </SentenceBlock>

            { loading
                ? <SkeletonParagraph lines={ 5 } />
                : <ExplanationText dangerouslySetInnerHTML={ { __html: rendered_html } } /> }

        </Panel>
    </Overlay>

}
