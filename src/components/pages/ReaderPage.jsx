import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import * as Throttle from 'promise-parallel-throttle'
import { use_book } from '../../hooks/use_book.js'
import { use_translation } from '../../hooks/use_translation.js'
import { use_word_lookup } from '../../hooks/use_word_lookup.js'
import { use_settings_store } from '../../stores/settings_store.js'
import { save_progress, get_progress } from '../../modules/cache.js'
import { DEFAULT_LEVEL, LEVELS } from '../../modules/prompts.js'
import { segment_translation_text } from '../../modules/translation_alignment.js'
import Sentence from '../molecules/Sentence.jsx'
import ExplanationPopover from '../molecules/ExplanationPopover.jsx'
import TranslationInfoSheet from '../molecules/TranslationInfoSheet.jsx'
import SettingsDrawer from '../molecules/SettingsDrawer.jsx'
import ReaderVocabularyPanel from '../molecules/ReaderVocabularyPanel.jsx'
import LanguagePicker from '../molecules/LanguagePicker.jsx'
import LevelPicker from '../molecules/LevelPicker.jsx'
import ProgressBar from '../atoms/ProgressBar.jsx'
import { SkeletonParagraph } from '../atoms/Skeleton.jsx'
import LevelBadge from '../atoms/LevelBadge.jsx'
import { estimate_cost, format_tokens, format_cost } from '../../modules/pricing.js'

// --- Styled Components ---

const Page = styled.div`
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg);
`

const TopBar = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-s) var(--space-l);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--bg-surface);
    z-index: 10;
    min-height: 48px;
`

const BackBtn = styled.button`
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.2em;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-s);

    &:hover { background: var(--bg-hover); color: var(--text); }
`

const ChapterTitle = styled.span`
    font-size: 0.85em;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 50%;
    text-align: center;
`

const GearBtn = styled.button`
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.2em;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-s);

    &:hover { background: var(--bg-hover); color: var(--text); }
`

const ReadingArea = styled.main`
    flex: 1;
    max-width: 65ch;
    width: 100%;
    margin: 0 auto;
    padding: var(--space-xl) var(--space-l);
    padding-bottom: calc(var(--space-xl) + var(--reader-dock-height, 0px));
    font-size: ${ p => p.$font_size }px;
    font-family: ${ p => p.$font_family }, system-ui, sans-serif;
    line-height: 1.8;
    letter-spacing: 0.01em;
    overflow-wrap: break-word;
`

const Paragraph = styled.p`
    margin-bottom: var(--space-l);
    line-height: 1.8;
`

const Heading = styled.div`
    font-family: var(--font-heading);
    font-weight: 500;
    margin: var(--space-xl) 0 var(--space-l);

    &[data-level="1"] { font-size: 1.8em; }
    &[data-level="2"] { font-size: 1.4em; }
    &[data-level="3"] { font-size: 1.2em; }
    &[data-level="4"], &[data-level="5"], &[data-level="6"] { font-size: 1.1em; }
`

const ListContainer = styled.ul`
    margin-bottom: var(--space-l);
    padding-left: var(--space-xl);
    list-style-type: ${ p => p.$ordered ? `decimal` : `disc` };
`

const ListItem = styled.li`
    margin-bottom: var(--space-s);
    line-height: 1.8;
`

const Blockquote = styled.blockquote`
    border-left: 3px solid var(--accent);
    padding-left: var(--space-l);
    margin: var(--space-l) 0;
    color: var(--text-muted);
    font-style: italic;
`

const ReaderDock = styled.div`
    position: sticky;
    bottom: 0;
    z-index: 80;
    width: 100%;
`

const BottomBar = styled.footer`
    border-top: 1px solid var(--border);
    padding: var(--space-m) var(--space-l) calc(var(--space-m) + env(safe-area-inset-bottom));
    background: var(--bg-surface);
`

const NavRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--space-s);
`

const NavBtn = styled.button`
    background: none;
    border: 1px solid var(--border);
    color: var(--text);
    padding: var(--space-s) var(--space-m);
    border-radius: var(--radius-s);
    min-width: 44px;
    min-height: 44px;
    font-size: 0.85em;

    &:hover:not(:disabled) { background: var(--bg-hover); }
    &:disabled { opacity: 0.3; cursor: not-allowed; }
`

const ProgressText = styled.span`
    font-size: 0.8em;
    color: var(--text-muted);
`

const StatusRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-s);
`

const TranslatingIndicator = styled.span`
    font-size: 0.75em;
    color: var(--accent);
    animation: pulse 1.5s ease infinite;

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
`

const TokenStats = styled.span`
    font-size: 0.7em;
    color: var(--text-muted);
    display: flex;
    gap: var(--space-s);
    align-items: center;
`

const OfflineBanner = styled.div`
    background: var(--accent-light);
    color: var(--accent-dark);
    text-align: center;
    padding: var(--space-xs) var(--space-m);
    font-size: 0.8em;
`

const ChapterError = styled.div`
    text-align: center;
    padding: var(--space-2xl) var(--space-l);
    color: var(--text-muted);
    font-size: 0.9em;
    line-height: 1.6;
`

// --- Language Selection Modal ---

const ModalOverlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: var(--space-l);
`

const ModalCard = styled.div`
    background: var(--bg-surface);
    border-radius: var(--radius-l);
    padding: var(--space-2xl);
    max-width: 420px;
    width: 100%;
    box-shadow: var(--shadow-l);
`

const ModalTitle = styled.h2`
    margin-bottom: var(--space-l);
    text-align: center;
`

const ModalSection = styled.div`
    margin-bottom: var(--space-l);
`

const ModalLabel = styled.label`
    display: block;
    font-size: 0.8em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: var(--space-s);
`

const StartButton = styled.button`
    width: 100%;
    padding: var(--space-m);
    background: var(--accent);
    color: white;
    border: none;
    border-radius: var(--radius-m);
    font-size: 1em;
    font-weight: 600;
    min-height: 48px;

    &:hover { background: var(--accent-dark); }
`

// --- Chapter TOC Dropdown ---

const TocSelect = styled.select`
    max-width: 200px;
    min-width: 0;
    flex: 1;
    padding: var(--space-xs) var(--space-s);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    background: var(--bg);
    color: var(--text);
    font-size: 0.8em;
    text-overflow: ellipsis;
`

// --- Component ---

export default function ReaderPage() {

    const { book_id } = useParams()
    const navigate = useNavigate()

    // Book loading
    const {
        book_meta, chapters, spine, current_chapter, current_chapter_content,
        ahead_chapters_content,
        go_to_chapter, next_chapter, prev_chapter, progress,
        loading, chapter_loading, chapter_error, source_language
    } = use_book( book_id )

    // Settings
    const { font_size, font_family, last_language, last_level, set_last_language, set_last_level, model } = use_settings_store()

    // UI state
    const [ settings_open, set_settings_open ] = useState( false )
    const [ show_language_modal, set_show_language_modal ] = useState( false )
    const [ language_chosen, set_language_chosen ] = useState( false )
    const [ explanation_data, set_explanation_data ] = useState( null )
    const [ translation_selection, set_translation_selection ] = useState( null )
    const [ is_offline, set_is_offline ] = useState( !navigator.onLine )
    const reading_area_ref = useRef( null )
    const reader_dock_ref = useRef( null )
    const selected_word_element_ref = useRef( null )

    // Check if user has already chosen a language for this book
    useEffect( () => {
        let mounted = true

        if( !loading && book_meta && !language_chosen ) {
            // Check saved progress for this book
            get_progress( book_id ).then( saved => {
                if( !mounted ) return
                if( saved?.chapter_index !== undefined ) {
                    // Returning reader — restore position
                    go_to_chapter( saved.chapter_index )
                    set_language_chosen( true )
                } else {
                    // First time — show language modal
                    set_show_language_modal( true )
                }
            } ).catch( () => {
                // IndexedDB may fail — fall back to showing language modal
                if( mounted ) set_show_language_modal( true )
            } )
        }

        return () => {
            mounted = false 
        }
    }, [ loading, book_meta, book_id, language_chosen, go_to_chapter ] )

    // Helper: extract sentences from chapter content
    const extract_sentences = ( content ) => {
        if( !content?.elements ) return []
        const sentences = []
        for( const el of content.elements ) {
            if( el.sentences ) {
                const context = el.sentences.map( s => s.text ).join( ` ` )
                for( const s of el.sentences ) sentences.push( { ...s, context } )
            }
            if( el.items ) {
                for( const item of el.items ) {
                    const context = item.sentences.map( s => s.text ).join( ` ` )
                    for( const s of item.sentences ) sentences.push( { ...s, context } )
                }
            }
        }
        return sentences
    }

    const current_chapter_sentences = useMemo(
        () => extract_sentences( current_chapter_content ),
        [ current_chapter_content ]
    )

    // Flatten current chapter + 2 ahead chapters for translation read-ahead
    const all_sentences = useMemo( () => {
        const ahead = ahead_chapters_content.flatMap( extract_sentences )
        return [ ...current_chapter_sentences, ...ahead ]
    }, [ current_chapter_sentences, ahead_chapters_content ] )

    // Translation hook
    const {
        translations,
        meanings,
        meaning_loading,
        meaning_errors,
        request_sentence_meaning,
        retranslate_sentence,
        is_translating,
        token_usage
    } = use_translation( {
        all_sentences,
        target_language: language_chosen ? last_language : null,
        level: language_chosen ? last_level : null,
        source_language,
        book_id
    } )

    const selected_sentence = useMemo(
        () => current_chapter_sentences.find(
            sentence => sentence.id === translation_selection?.sentence_id
        ) || null,
        [ current_chapter_sentences, translation_selection ]
    )
    const selected_translation = selected_sentence
        ? translations[selected_sentence.id]
        : null
    const { lookup_word, get_lookup_state, cancel_lookups } = use_word_lookup( {
        source_language,
        target_language: last_language,
        sentence_context: selected_translation || ``,
        cache_by_context: true
    } )
    const selected_translation_segments = useMemo(
        () => segment_translation_text( selected_translation ),
        [ selected_translation ]
    )
    const selected_word_lookup = translation_selection?.word
        ? get_lookup_state( translation_selection.word )
        : null

    const word_by_word_segments = selected_translation_segments.map( segment => {
        if( !segment.is_word ) return segment

        return {
            ...segment,
            ...get_lookup_state( segment.text ),
            selected: segment.word_index === translation_selection?.word_index
        }
    } )
    const word_by_word_loading = word_by_word_segments.some(
        segment => segment.is_word
            && !segment.content
            && !segment.error
            && segment.can_lookup
    )

    useEffect( () => {
        if( !translation_selection?.word || !selected_translation ) return

        const tap_controller = new AbortController()
        lookup_word( translation_selection.word, { signal: tap_controller.signal } )

        return () => tap_controller.abort()
    }, [ translation_selection, selected_translation, lookup_word ] )

    useEffect( () => {
        if( !selected_sentence || !selected_translation ) return

        const queue_controller = new AbortController()
        const word_segments = selected_translation_segments.filter( segment => segment.is_word )
        const unique_segments = word_segments.filter( ( segment, index ) =>
            word_segments.findIndex( candidate =>
                candidate.text.toLowerCase() === segment.text.toLowerCase()
            ) === index
        )
        const lookup_tasks = unique_segments.map( segment => async () => {
            if( queue_controller.signal.aborted ) return
            await lookup_word( segment.text, {
                retry: false,
                signal: queue_controller.signal
            } )
        } )

        // Keep the direct translation responsive without bursting one API
        // request per word. The tapped-word effect runs first and shares this
        // hook's three-request ceiling with the background queue.
        Throttle.all( lookup_tasks, {
            maxInProgress: 3,
            failFast: false,
            nextCheck: async () => !queue_controller.signal.aborted
        } ).catch( () => {} )

        return () => queue_controller.abort()
    }, [
        selected_sentence,
        selected_translation,
        selected_translation_segments,
        lookup_word
    ] )

    useEffect( () => () => cancel_lookups(), [ selected_translation, cancel_lookups ] )

    // Save progress on chapter change
    useEffect( () => {
        if( book_id && language_chosen ) {
            save_progress( {
                book_id,
                chapter_index: current_chapter,
                scroll_position: 0,
                last_read_at: new Date().toISOString()
            } ).catch( () => {} )
        }
    }, [ book_id, current_chapter, language_chosen ] )

    // Save progress on tab close / navigation away
    useEffect( () => {
        if( !book_id || !language_chosen ) return

        const handle_unload = () => {
            // Use synchronous-friendly approach: save_progress is async but
            // we fire-and-forget here since the page is unloading
            save_progress( {
                book_id,
                chapter_index: current_chapter,
                scroll_position: 0,
                last_read_at: new Date().toISOString()
            } ).catch( () => {} )
        }

        window.addEventListener( `pagehide`, handle_unload )
        return () => window.removeEventListener( `pagehide`, handle_unload )
    }, [ book_id, current_chapter, language_chosen ] )

    // Online/offline detection
    useEffect( () => {
        const go_online = () => set_is_offline( false )
        const go_offline = () => set_is_offline( true )
        window.addEventListener( `online`, go_online )
        window.addEventListener( `offline`, go_offline )
        return () => {
            window.removeEventListener( `online`, go_online )
            window.removeEventListener( `offline`, go_offline )
        }
    }, [] )

    // Keyboard navigation — disabled when any overlay is open
    useEffect( () => {
        const handle_key = ( e ) => {

            // Let the active overlay own Escape. Clearing the underlying word
            // selection here would make one key press dismiss two UI layers.
            const overlay_open = settings_open || explanation_data || show_language_modal

            if( e.key === `Escape` && translation_selection && !overlay_open ) {
                set_translation_selection( null )
                return
            }

            // Don't navigate when an overlay is open
            if( e.key === `ArrowLeft` && !overlay_open ) prev_chapter()
            if( e.key === `ArrowRight` && !overlay_open ) next_chapter()
            if( e.key === `Escape` && !overlay_open ) navigate( `/library` )

        }
        window.addEventListener( `keydown`, handle_key )
        return () => window.removeEventListener( `keydown`, handle_key )
    }, [
        prev_chapter,
        next_chapter,
        navigate,
        settings_open,
        explanation_data,
        show_language_modal,
        translation_selection
    ] )

    const select_translation_word = useCallback( ( { sentence_id, word_index, word, element } ) => {
        selected_word_element_ref.current = element
        set_translation_selection( { sentence_id, word_index, word } )
    }, [] )

    const close_translation_sheet = useCallback( () => {
        selected_word_element_ref.current = null
        set_translation_selection( null )
    }, [] )

    const handle_retranslate_sentence = useCallback( async ( { sentence_id } ) => {
        const result = await retranslate_sentence( { sentence_id } )
        if( !result ) return null

        // The refreshed translation may no longer have the selected token index.
        close_translation_sheet()

        set_explanation_data( current => {
            if( current?.sentence_id !== sentence_id ) return current
            return {
                ...current,
                translated: result.translated,
                refresh_key: ( current.refresh_key || 0 ) + 1
            }
        } )

        return result
    }, [ retranslate_sentence, close_translation_sheet ] )

    // Swipe navigation for mobile
    const touch_start_ref = useRef( null )

    const handle_touch_start = useCallback( ( e ) => {
        touch_start_ref.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }, [] )

    const handle_touch_end = useCallback( ( e ) => {
        if( !touch_start_ref.current ) return

        const dx = e.changedTouches[0].clientX - touch_start_ref.current.x
        const dy = e.changedTouches[0].clientY - touch_start_ref.current.y

        // Only trigger if horizontal swipe is dominant and long enough
        if( Math.abs( dx ) > 80 && Math.abs( dx ) > Math.abs( dy ) * 1.5 ) {
            if( dx > 0 ) prev_chapter()
            else next_chapter()
        }

        touch_start_ref.current = null
    }, [ prev_chapter, next_chapter ] )

    // Tap-edge navigation: clicking the left/right 12% of the reading area navigates chapters
    const handle_edge_click = useCallback( ( e ) => {

        // Skip if the click target is a sentence or interactive element
        const { target } = e
        if( target.closest( `[data-sentence-id]` ) || target.closest( `button` ) || target.closest( `a` ) ) return

        const rect = reading_area_ref.current.getBoundingClientRect()
        const x_ratio = ( e.clientX - rect.left ) / rect.width

        if( x_ratio < 0.12 ) prev_chapter()
        else if( x_ratio > 0.88 ) next_chapter()

    }, [ prev_chapter, next_chapter ] )

    // Keep fixed reader utilities above the complete reader dock as it changes height.
    useEffect( () => {
        const dock = reader_dock_ref.current
        if( !dock ) return

        const root = document.documentElement
        const update_dock_height = () => {
            root.style.setProperty( `--reader-dock-height`, `${ dock.offsetHeight }px` )
        }

        update_dock_height()

        const observer = typeof ResizeObserver === `undefined`
            ? null
            : new ResizeObserver( update_dock_height )

        observer?.observe( dock )
        window.addEventListener( `resize`, update_dock_height )

        return () => {
            observer?.disconnect()
            window.removeEventListener( `resize`, update_dock_height )
            root.style.removeProperty( `--reader-dock-height` )
        }
    }, [ loading, show_language_modal ] )

    // Keep the selected word visible after the sheet changes the dock height.
    useEffect( () => {
        if( !translation_selection || !selected_word_element_ref.current ) return

        let second_frame = null
        const first_frame = requestAnimationFrame( () => {
            second_frame = requestAnimationFrame( () => {
                selected_word_element_ref.current?.scrollIntoView( {
                    block: `nearest`,
                    inline: `nearest`
                } )
            } )
        } )

        return () => {
            cancelAnimationFrame( first_frame )
            if( second_frame ) cancelAnimationFrame( second_frame )
        }
    }, [ translation_selection ] )

    useEffect( () => {
        if( !selected_sentence || !selected_translation ) return

        request_sentence_meaning( {
            sentence_id: selected_sentence.id,
            translated: selected_translation
        } )
    }, [ selected_sentence, selected_translation, request_sentence_meaning ] )

    const explain_selected_translation = useCallback( () => {
        if( !selected_sentence || !selected_translation ) return

        set_explanation_data( {
            sentence_id: selected_sentence.id,
            original: selected_sentence.text,
            translated: selected_translation
        } )
    }, [ selected_sentence, selected_translation ] )

    // Scroll to top and close fragment-specific UI on chapter change
    useEffect( () => {
        if( reading_area_ref.current ) {
            reading_area_ref.current.scrollTo( 0, 0 )
        }
        window.scrollTo( 0, 0 )
        set_explanation_data( null )
        close_translation_sheet()
    }, [ current_chapter, close_translation_sheet ] )

    // Close fragment-specific UI when language or level changes (stale content)
    useEffect( () => {
        set_explanation_data( null )
        close_translation_sheet()
    }, [ last_language, last_level, close_translation_sheet ] )

    // Get level info for badge
    const level_info = LEVELS.find( l => l.code === last_level ) || DEFAULT_LEVEL

    const current_chapter_translations = useMemo(
        () => current_chapter_sentences.map( sentence => translations[sentence.id] ).filter( Boolean ),
        [ current_chapter_sentences, translations ]
    )

    // --- Render helpers ---

    // Render sentences with inter-sentence spacing via text node
    const render_sentence = ( sentence, index ) => <Fragment key={ sentence.id }>
        { index > 0 && ` ` }
        <Sentence
            sentence_id={ sentence.id }
            original={ sentence.text }
            translated={ translations[sentence.id] }
            selected_word_index={ translation_selection?.sentence_id === sentence.id
                ? translation_selection.word_index
                : null }
            word_lookup={ translation_selection?.sentence_id === sentence.id
                ? selected_word_lookup
                : null }
            on_select_word={ select_translation_word }
        />
    </Fragment>

    const render_element = ( element, i ) => {

        switch ( element.type ) {

        case `heading`:
            return <Heading key={ i } data-level={ element.level }>
                { element.sentences.map( render_sentence ) }
            </Heading>

        case `paragraph`:
            return <Paragraph key={ i }>
                { element.sentences.map( render_sentence ) }
            </Paragraph>

        case `unordered_list`:
        case `ordered_list`:
            return <ListContainer key={ i } $ordered={ element.type === `ordered_list` }>
                { element.items.map( ( item, j ) =>
                    <ListItem key={ j }>
                        { item.sentences.map( render_sentence ) }
                    </ListItem>
                ) }
            </ListContainer>

        case `blockquote`:
            return <Blockquote key={ i }>
                { element.sentences.map( render_sentence ) }
            </Blockquote>

        case `image`:
            return <img key={ i } src={ element.src } alt={ element.alt } />

        default:
            return null
        }

    }

    // --- Book not found — redirect to library ---

    useEffect( () => {
        if( !loading && !book_meta ) {
            navigate( `/library`, { replace: true } )
        }
    }, [ loading, book_meta, navigate ] )

    if( !loading && !book_meta ) {
        return null
    }

    // --- Loading state ---

    if( loading ) return <Page>
        <TopBar>
            <BackBtn onClick={ () => navigate( `/library` ) }>←</BackBtn>
            <ChapterTitle>Loading...</ChapterTitle>
            <div style={ { width: 44 } } />
        </TopBar>
        <ReadingArea $font_size={ font_size } $font_family={ font_family }>
            <SkeletonParagraph lines={ 4 } />
            <SkeletonParagraph lines={ 5 } />
            <SkeletonParagraph lines={ 3 } />
        </ReadingArea>
    </Page>

    // --- Language selection modal ---

    if( show_language_modal ) return <Page>
        <ModalOverlay role="dialog" aria-modal="true" aria-label="Choose your language">
            <ModalCard>
                <ModalTitle>Choose Your Language</ModalTitle>

                <ModalSection>
                    <ModalLabel>Target Language</ModalLabel>
                    <LanguagePicker value={ last_language } on_change={ set_last_language } />
                </ModalSection>

                <ModalSection>
                    <ModalLabel>Proficiency Level</ModalLabel>
                    <LevelPicker value={ last_level } on_change={ set_last_level } />
                </ModalSection>

                <StartButton onClick={ () => {
                    set_show_language_modal( false )
                    set_language_chosen( true )
                } }
                >
                    Start Reading
                </StartButton>
            </ModalCard>
        </ModalOverlay>
    </Page>

    // --- Chapter title ---
    const current_spine_href = spine[current_chapter]?.href?.split( `#` )[0]
    const chapter_title = chapters.find( c => c.href?.split( `#` )[0] === current_spine_href )?.label
        || book_meta?.title
        || `Chapter ${ current_chapter + 1 }`

    return <Page>

        { is_offline && <OfflineBanner>
            Offline — showing cached translations
        </OfflineBanner> }

        <TopBar>
            <BackBtn onClick={ () => navigate( `/library` ) } aria-label="Back to library">←</BackBtn>

            { /* eslint-disable react/jsx-indent-props */ }
            { chapters.length > 1
                ? <TocSelect
                    value={ current_chapter }
                    onChange={ ( e ) => go_to_chapter( Number( e.target.value ) ) }
                >
                    { spine.map( ( spine_item, i ) => {
                        // Match TOC entry by href (strip hash fragments for comparison)
                        const spine_href = spine_item?.href?.split( `#` )[0]
                        const toc_entry = chapters.find( c => c.href?.split( `#` )[0] === spine_href )
                        return <option key={ i } value={ i }>
                            { toc_entry?.label || `Section ${ i + 1 }` }
                        </option>
                    } ) }
                </TocSelect>
                : <ChapterTitle>{ chapter_title }</ChapterTitle> }

            <GearBtn onClick={ () => set_settings_open( true ) } aria-label="Settings">⚙</GearBtn>
        </TopBar>

        <ReadingArea
            ref={ reading_area_ref }
            $font_size={ font_size }
            $font_family={ font_family }
            onTouchStart={ handle_touch_start }
            onTouchEnd={ handle_touch_end }
            onClick={ handle_edge_click }
        >

            { chapter_loading && <>
                <SkeletonParagraph lines={ 4 } />
                <SkeletonParagraph lines={ 5 } />
                <SkeletonParagraph lines={ 3 } />
            </> }

            { !chapter_loading && chapter_error && <ChapterError>
                { chapter_error }
                <br />
                Try navigating to a different chapter.
            </ChapterError> }

            { !chapter_loading && !chapter_error && current_chapter_content?.elements?.length > 0
                && current_chapter_content.elements.map( render_element ) }

            { !chapter_loading && !chapter_error && current_chapter_content?.elements?.length === 0
                && <ChapterError>This chapter has no translatable text content.</ChapterError> }

        </ReadingArea>

        { language_chosen && <ReaderVocabularyPanel
            translated_texts={ current_chapter_translations }
            source_language={ source_language }
            target_language={ last_language }
        /> }

        <ReaderDock ref={ reader_dock_ref } data-reader-dock>
            { translation_selection && selected_sentence && <TranslationInfoSheet
                meaning={ meanings[selected_sentence.id] }
                loading={ !!meaning_loading[selected_sentence.id] }
                error={ !!meaning_errors[selected_sentence.id] }
                word_by_word_segments={ word_by_word_segments }
                word_by_word_loading={ word_by_word_loading }
                on_close={ close_translation_sheet }
                on_explain={ explain_selected_translation }
            /> }

            <BottomBar>
                <StatusRow>
                    <LevelBadge cefr={ level_info.cefr } label={ level_info.label } />
                    { is_translating && <TranslatingIndicator>Translating...</TranslatingIndicator> }
                    { ( token_usage.prompt_tokens > 0 || token_usage.completion_tokens > 0 ) && <TokenStats>
                        { format_tokens( token_usage.prompt_tokens + token_usage.completion_tokens ) } tokens
                        · { format_cost( estimate_cost( token_usage.prompt_tokens, token_usage.completion_tokens, model ) ) }
                    </TokenStats> }
                </StatusRow>
                <ProgressBar percent={ progress } />
                <NavRow>
                    <NavBtn onClick={ prev_chapter } disabled={ current_chapter === 0 }>
                        ← Prev
                    </NavBtn>
                    <ProgressText>{ current_chapter + 1 } / { spine.length } · { progress }%</ProgressText>
                    <NavBtn onClick={ next_chapter } disabled={ current_chapter >= spine.length - 1 }>
                        Next →
                    </NavBtn>
                </NavRow>
            </BottomBar>
        </ReaderDock>

        { /* Settings Drawer */ }
        <SettingsDrawer
            is_open={ settings_open }
            on_close={ () => set_settings_open( false ) }
            show_language={ true }
        />

        { /* Explanation Popover */ }
        { explanation_data && <ExplanationPopover
            sentence_id={ explanation_data.sentence_id }
            original={ explanation_data.original }
            translated={ explanation_data.translated }
            refresh_key={ explanation_data.refresh_key || 0 }
            source_language={ source_language }
            target_language={ last_language }
            on_retranslate={ handle_retranslate_sentence }
            on_close={ () => set_explanation_data( null ) }
        /> }

    </Page>

}
