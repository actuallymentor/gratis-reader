import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import styled from 'styled-components'
import { marked } from 'marked'
import { RotateCw } from 'lucide-react'
import Modal from '../atoms/Modal.jsx'
import { use_confirm } from './ConfirmModal.jsx'
import { IconButton } from '../atoms/Button.jsx'
import { chat_completion } from '../../modules/open_router.js'
import { build_explanation_prompt, DEFAULT_LEVEL, LEVELS } from '../../modules/prompts.js'
import { use_settings_store } from '../../stores/settings_store.js'
import { SkeletonParagraph } from '../atoms/Skeleton.jsx'
import { log } from 'mentie'
import WordTooltipText from './WordTooltipText.jsx'
import { clean_lookup_word, word_cache_key, use_word_lookup } from '../../hooks/use_word_lookup.js'

// Runaway guard only; explanations are a paragraph, reasoning models bill thinking on top
const EXPLANATION_MAX_TOKENS = 6_000

const LOOKUP_UNAVAILABLE = `Lookup unavailable`
const FLOATING_TOOLTIP_HALF_WIDTH = 130
const FLOATING_TOOLTIP_TOP_GAP = 56
const FLOATING_TOOLTIP_VIEWPORT_GAP = 12
const FOREIGN_WORD_IGNORED_SELECTOR = [
    `a`,
    `button`,
    `code`,
    `pre`,
    `kbd`,
    `samp`,
    `script`,
    `style`,
    `textarea`,
    `select`,
    `input`
].join( `,` )

const tooltip_arrow_offset = ( offset = 0 ) =>
    `${ offset < 0 ? `-` : `+` } ${ Math.abs( offset ) }px`

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

    .foreign-word {
        appearance: none;
        background: none;
        border: 0;
        color: inherit;
        cursor: pointer;
        display: inline;
        font: inherit;
        margin: 0;
        padding: 0;
        text-align: inherit;
        border-radius: 2px;
    }

    .foreign-word:hover {
        color: var(--accent-dark);
    }

    .foreign-word:focus-visible {
        color: var(--accent-dark);
        outline: 2px solid var(--accent-dark);
        outline-offset: 2px;
    }
`

const FloatingTooltip = styled.div`
    position: fixed;
    left: ${ p => p.$x }px;
    top: ${ p => p.$y }px;
    transform: translate(-50%, -100%);
    padding: var(--space-xs) var(--space-s);
    background: var(--text);
    color: var(--bg);
    border-radius: var(--radius-s);
    font-size: 0.8em;
    white-space: nowrap;
    max-width: 250px;
    overflow: visible;
    pointer-events: auto;
    cursor: pointer;
    z-index: 300;

    &::after {
        content: '';
        position: absolute;
        top: 100%;
        left: clamp( 8px, calc( 50% ${ p => tooltip_arrow_offset( p.$arrow_offset ) } ), calc( 100% - 8px ) );
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: var(--text);
    }

    > span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
    }
`

const clamp = ( value, min, max ) => Math.min( Math.max( value, min ), Math.max( min, max ) )

const floating_tooltip_position = ( rect, boundary_rect ) => {
    const boundary = boundary_rect || {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight
    }
    const boundary_width = Math.max(
        FLOATING_TOOLTIP_VIEWPORT_GAP * 2,
        boundary.right - boundary.left
    )
    const tooltip_half_width = Math.min(
        FLOATING_TOOLTIP_HALF_WIDTH,
        Math.max( FLOATING_TOOLTIP_VIEWPORT_GAP, ( boundary_width - FLOATING_TOOLTIP_VIEWPORT_GAP * 2 ) / 2 )
    )
    const word_center_x = rect.left + rect.width / 2
    const x = clamp(
        word_center_x,
        boundary.left + tooltip_half_width,
        boundary.right - tooltip_half_width
    )

    return {
        x,
        y: clamp(
            rect.top - 8,
            boundary.top + FLOATING_TOOLTIP_TOP_GAP,
            boundary.bottom - FLOATING_TOOLTIP_VIEWPORT_GAP
        ),
        arrow_offset: word_center_x - x
    }
}

const decorate_explanation_html = ( html, translated_words ) => {
    if( !html || translated_words.size === 0 || typeof DOMParser === `undefined` ) return html

    const doc = new DOMParser().parseFromString( html, `text/html` )
    const root = doc.body
    let decorated_count = 0

    const walker = doc.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: ( node ) => {
                const parent = node.parentElement
                if( !parent || parent.closest( `[data-foreign-word]` ) ) return NodeFilter.FILTER_REJECT
                if( parent.closest( FOREIGN_WORD_IGNORED_SELECTOR ) ) return NodeFilter.FILTER_REJECT

                return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
            }
        }
    )

    const text_nodes = []
    while( walker.nextNode() ) text_nodes.push( walker.currentNode )

    text_nodes.forEach( node => {
        const fragment = doc.createDocumentFragment()

        node.nodeValue.split( /(\s+)/ ).forEach( part => {
            if( !part ) return

            const clean_word = clean_lookup_word( part ).toLowerCase()
            if( clean_word && translated_words.has( clean_word ) ) {
                // Keep explanation text selectable and avoid native button keyboard click synthesis.
                const word_el = doc.createElement( `span` )
                word_el.className = `foreign-word`
                word_el.dataset.foreignWord = part
                word_el.dataset.wordTooltipWord = clean_lookup_word( part )
                word_el.dataset.wordTooltipInstance = `${ decorated_count }-${ clean_word }`
                word_el.setAttribute( `role`, `button` )
                word_el.setAttribute( `tabindex`, `0` )
                word_el.setAttribute( `aria-label`, `Look up ${ clean_lookup_word( part ) }` )
                word_el.textContent = part
                fragment.appendChild( word_el )
                decorated_count += 1
                return
            }

            fragment.appendChild( doc.createTextNode( part ) )
        } )

        node.parentNode.replaceChild( fragment, node )
    } )

    return decorated_count > 0 ? root.innerHTML : html
}

/**
 * Explanation popover for long-press on a sentence
 * @param {Object} props
 * @param {string} props.original
 * @param {string} props.translated
 * @param {number} props.refresh_key
 * @param {string} props.source_language
 * @param {string} props.target_language
 * @param {string} props.sentence_id
 * @param {Function} [props.on_retranslate]
 * @param {Function} props.on_close
 */
export default function ExplanationPopover( {
    original,
    translated,
    refresh_key = 0,
    source_language,
    target_language,
    sentence_id,
    on_retranslate,
    on_close
} ) {

    const [ explanation, set_explanation ] = useState( null )
    const [ loading, set_loading ] = useState( true )
    const [ retranslating, set_retranslating ] = useState( false )
    const [ explanation_tooltips, set_explanation_tooltips ] = useState( {} )
    const explanation_ref = useRef( null )
    const panel_ref = useRef( null )
    const [ confirm_element, confirm ] = use_confirm()
    const api_key = use_settings_store( state => state.api_key )
    const model = use_settings_store( state => state.model )
    const last_level = use_settings_store( state => state.last_level )
    const { lookup_word, get_lookup_state } = use_word_lookup( {
        source_language,
        target_language,
        sentence_context: translated
    } )

    const level_info = LEVELS.find( l => l.code === last_level ) || DEFAULT_LEVEL

    const rendered_html = useMemo( () => {
        if( !explanation ) return ``
        return marked.parse( explanation, { breaks: true } )
    }, [ explanation ] )

    const translated_words = useMemo( () => new Set(
        translated
            .split( /\s+/ )
            .map( word => clean_lookup_word( word ).toLowerCase() )
            .filter( Boolean )
    ), [ translated ] )

    const decorated_html = useMemo(
        () => decorate_explanation_html( rendered_html, translated_words ),
        [ rendered_html, translated_words ]
    )
    const decorated_inner_html = useMemo( () => ( { __html: decorated_html } ), [ decorated_html ] )

    const retranslate = useCallback( async () => {
        if( !on_retranslate || retranslating ) return
        const confirmed = await confirm( {
            title: `Do you want to re-translate this sentence?`,
            body: <p>The cached translation is replaced with a fresh one, which uses API credits.</p>,
            confirm_label: `Re-translate`,
            danger: false
        } )
        if( !confirmed ) return

        set_retranslating( true )
        set_loading( true )
        set_explanation( null )
        set_explanation_tooltips( {} )

        try {
            const result = await on_retranslate( { sentence_id } )
            if( !result ) {
                set_explanation( `Failed to re-translate sentence. Please try again.` )
                set_loading( false )
            }
        } finally {
            set_retranslating( false )
        }
    }, [ on_retranslate, retranslating, sentence_id, confirm ] )

    const dismiss_explanation_tooltip = useCallback( ( tooltip_key ) => {
        set_explanation_tooltips( tooltips => {
            if( !tooltips[tooltip_key] ) return tooltips

            const next_tooltips = { ...tooltips }
            delete next_tooltips[tooltip_key]
            return next_tooltips
        } )
    }, [] )

    // Fetch explanation on mount
    useEffect( () => {

        let cancelled = false
        const controller = new AbortController()
        set_loading( true )
        set_explanation( null )

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
                    max_tokens: EXPLANATION_MAX_TOKENS,
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
            cancelled = true
            controller.abort()
        }

    }, [ original, translated, refresh_key, source_language, target_language, api_key, model, level_info ] )

    const show_explanation_tooltip = useCallback( ( e ) => {
        const is_keyboard_activation = e.type === `keydown`
        if( is_keyboard_activation && ![ `Enter`, ` `, `Spacebar` ].includes( e.key ) ) return

        const word_el = e.target.closest?.( `[data-foreign-word]` )
        if( !word_el || !explanation_ref.current?.contains( word_el ) ) return

        e.preventDefault()
        if( !is_keyboard_activation ) {
            e.stopPropagation()
        }

        const clean_word = clean_lookup_word( word_el.dataset.foreignWord )
        if( !clean_word ) return

        const rect = word_el.getBoundingClientRect()
        const cache_key = word_cache_key( clean_word, source_language, target_language )
        const tooltip_key = word_el.dataset.wordTooltipInstance || cache_key
        const { x, y, arrow_offset } = floating_tooltip_position(
            rect,
            panel_ref.current?.getBoundingClientRect()
        )

        set_explanation_tooltips( tooltips => {
            if( tooltips[tooltip_key] ) return tooltips

            return {
                ...tooltips,
                [tooltip_key]: {
                    word: clean_word,
                    cache_key,
                    x,
                    y,
                    arrow_offset
                }
            }
        } )
        lookup_word( clean_word )
    }, [ lookup_word, source_language, target_language ] )

    useEffect( () => {
        window.addEventListener( `keydown`, show_explanation_tooltip, true )

        return () => window.removeEventListener( `keydown`, show_explanation_tooltip, true )
    }, [ show_explanation_tooltip ] )

    useEffect( () => {
        set_explanation_tooltips( {} )
    }, [ decorated_html ] )

    let explanation_body = <SkeletonParagraph lines={ 5 } />
    if( !loading ) explanation_body = <ExplanationText
        ref={ explanation_ref }
        onClick={ show_explanation_tooltip }
        dangerouslySetInnerHTML={ decorated_inner_html }
    />

    return <Modal
        title="Translation Explanation"
        width="56rem"
        on_close={ on_close }
        header_actions={ <IconButton
            label="Re-translate sentence"
            icon={ <RotateCw strokeWidth={ 1.5 } aria-hidden="true" /> }
            onClick={ retranslate }
            disabled={ retranslating || !on_retranslate }
        /> }
    >
        <div ref={ panel_ref }>

            <SentenceBlock>
                <Label>Original</Label>
                { original }
            </SentenceBlock>

            <SentenceBlock>
                <Label>Translation</Label>
                <WordTooltipText
                    text={ translated }
                    source_language={ source_language }
                    target_language={ target_language }
                    sentence_context={ translated }
                />
            </SentenceBlock>

            { explanation_body }

            { Object.entries( explanation_tooltips ).map( ( [ tooltip_key, tooltip ] ) => {
                const tooltip_state = get_lookup_state( tooltip.word )

                return <FloatingTooltip
                    key={ tooltip_key }
                    $x={ tooltip.x }
                    $y={ tooltip.y }
                    $arrow_offset={ tooltip.arrow_offset }
                    role="button"
                    tabIndex={ 0 }
                    aria-label="Dismiss word tooltip"
                    onPointerDown={ e => e.stopPropagation() }
                    onClick={ ( e ) => {
                        e.stopPropagation()
                        dismiss_explanation_tooltip( tooltip_key )
                    } }
                    onKeyDown={ ( e ) => {
                        if( ![ `Enter`, ` `, `Spacebar` ].includes( e.key ) ) return

                        e.preventDefault()
                        e.stopPropagation()
                        dismiss_explanation_tooltip( tooltip_key )
                    } }
                >
                    <span>
                        { tooltip_state?.loading
                            ? `...`
                            : tooltip_state?.content || LOOKUP_UNAVAILABLE }
                    </span>
                </FloatingTooltip>
            } ) }

        </div>
        { confirm_element }
    </Modal>

}
