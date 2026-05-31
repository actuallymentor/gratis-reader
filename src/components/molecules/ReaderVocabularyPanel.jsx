import { useCallback, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { clean_lookup_word, use_word_lookup } from '../../hooks/use_word_lookup.js'

const PANEL_WIDTH = `min(18rem, calc(100vw - 3.25rem))`
const ROW_HEIGHT_PX = 36
const RESERVED_VIEWPORT_HEIGHT_PX = 240
const MIN_WORD_COUNT = 4
const MAX_WORD_COUNT = 28
const PANEL_ID = `reader-vocabulary-panel`

const ToggleButton = styled.button`
    position: fixed;
    top: 50%;
    right: ${ p => p.$expanded ? PANEL_WIDTH : `0` };
    transform: translateY(-50%);
    z-index: 70;
    width: 44px;
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-right: 0;
    border-radius: var(--radius-s) 0 0 var(--radius-s);
    background: var(--bg-surface);
    color: var(--text-muted);
    box-shadow: var(--shadow-m);
    transition: right 0.22s ease, color 0.15s ease, background 0.15s ease;

    &:hover {
        color: var(--text);
        background: var(--bg-hover);
    }

    &:focus-visible {
        outline: 3px solid var(--accent);
        outline-offset: 3px;
    }

    svg {
        width: 1.1rem;
        height: 1.1rem;
        stroke-width: 2.4;
    }

    @media (max-width: 520px) {
        top: auto;
        bottom: calc(8.5rem + env(safe-area-inset-bottom));
        transform: none;
    }
`

const Panel = styled.aside`
    position: fixed;
    top: calc(48px + var(--space-m));
    right: 0;
    bottom: calc(7.5rem + var(--space-m) + env(safe-area-inset-bottom));
    z-index: 69;
    width: ${ PANEL_WIDTH };
    padding: var(--space-m);
    border-left: 1px solid var(--border);
    background: var(--bg-surface);
    box-shadow: var(--shadow-m);
    opacity: ${ p => p.$expanded ? 1 : 0 };
    pointer-events: ${ p => p.$expanded ? `auto` : `none` };
    transform: translateX(${ p => p.$expanded ? `0` : `100%` });
    transition: transform 0.22s ease-out, opacity 0.15s ease;
    overflow: hidden;

    @media (max-width: 520px) {
        top: calc(48px + var(--space-s));
        bottom: calc(8.5rem + env(safe-area-inset-bottom));
    }
`

const WordList = styled.ul`
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    list-style: none;
    overflow: hidden;
`

const WordRow = styled.li`
    min-height: 2rem;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    font-size: 0.82rem;
    line-height: 1.35;
`

const WordText = styled.span`
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`

const count_limit_for_height = ( viewport_height ) => {

    const raw_count = Math.floor( ( viewport_height - RESERVED_VIEWPORT_HEIGHT_PX ) / ROW_HEIGHT_PX )
    const bounded_count = Math.min( MAX_WORD_COUNT, raw_count )
    return Math.max( MIN_WORD_COUNT, bounded_count )

}

const segment_target_words = ( text ) => {

    const visible_text = String( text || `` )
    if( !visible_text.trim() ) return []

    if( typeof Intl !== `undefined` && Intl.Segmenter ) {
        try {
            const segmenter = new Intl.Segmenter( undefined, { granularity: `word` } )

            return Array.from( segmenter.segment( visible_text ) )
                .filter( segment => segment.isWordLike )
                .map( segment => segment.segment )
        } catch {
            // Some runtimes expose Segmenter but reject the requested granularity.
        }
    }

    return visible_text.split( /\s+/ )

}

const count_target_words = ( translated_texts, limit ) => {

    const word_counts = translated_texts
        .flatMap( segment_target_words )
        .map( clean_lookup_word )
        .filter( Boolean )
        .reduce( ( counts, word ) => {
            const word_key = word.toLocaleLowerCase()
            const current = counts[word_key] || { word, count: 0 }

            return {
                ...counts,
                [word_key]: {
                    ...current,
                    count: current.count + 1
                }
            }
        }, {} )

    return Object.values( word_counts )
        .sort( ( a, b ) => b.count - a.count || a.word.localeCompare( b.word ) )
        .slice( 0, limit )

}

/**
 * Shows the most common target-language words on the current reader page.
 * @param {Object} props
 * @param {string[]} props.translated_texts
 * @param {string} props.source_language
 * @param {string} props.target_language
 * @returns {JSX.Element|null}
 */
export default function ReaderVocabularyPanel( {
    translated_texts,
    source_language,
    target_language
} ) {

    const [ expanded, set_expanded ] = useState( false )
    const [ word_limit, set_word_limit ] = useState( () => count_limit_for_height(
        typeof window === `undefined` ? 720 : window.innerHeight
    ) )
    const sentence_context = translated_texts.join( ` ` )
    const { lookup_word, get_lookup_state } = use_word_lookup( {
        source_language,
        target_language,
        sentence_context
    } )

    useEffect( () => {
        const update_word_limit = () => set_word_limit( count_limit_for_height( window.innerHeight ) )

        update_word_limit()
        window.addEventListener( `resize`, update_word_limit )
        return () => window.removeEventListener( `resize`, update_word_limit )
    }, [] )

    const words = useMemo(
        () => count_target_words( translated_texts, word_limit ),
        [ translated_texts, word_limit ]
    )

    useEffect( () => {
        if( !expanded ) return
        words.forEach( ( { word } ) => lookup_word( word ) )
    }, [ expanded, words, lookup_word ] )

    const toggle_expanded = useCallback( () => {
        set_expanded( current => !current )
    }, [] )

    if( words.length === 0 ) return null

    return <>
        <ToggleButton
            type="button"
            $expanded={ expanded }
            onClick={ toggle_expanded }
            aria-label={ expanded ? `Collapse vocabulary list` : `Expand vocabulary list` }
            aria-expanded={ expanded }
            aria-controls={ PANEL_ID }
        >
            { expanded ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" /> }
        </ToggleButton>

        <Panel
            id={ PANEL_ID }
            $expanded={ expanded }
            aria-label="Common words"
            aria-hidden={ !expanded }
            inert={ !expanded }
        >
            <WordList>
                { words.map( ( { word, count } ) => {
                    const { content, loading } = get_lookup_state( word )
                    const translated_word = loading || !content ? `...` : content
                    const row_text = `${ word } - ${ translated_word } (${ count }x)`

                    return <WordRow key={ word } data-reader-vocabulary-row>
                        <WordText title={ row_text }>{ row_text }</WordText>
                    </WordRow>
                } ) }
            </WordList>
        </Panel>
    </>

}
