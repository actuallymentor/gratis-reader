import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import { use_book } from '../../hooks/use_book.js'
import { use_translation } from '../../hooks/use_translation.js'
import { use_settings_store } from '../../stores/settings_store.js'
import { save_progress, get_progress } from '../../modules/cache.js'
import { DEFAULT_LEVEL, LEVELS } from '../../modules/prompts.js'
import Sentence from '../molecules/Sentence.jsx'
import ExplanationPopover from '../molecules/ExplanationPopover.jsx'
import SettingsDrawer from '../molecules/SettingsDrawer.jsx'
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

const BottomBar = styled.footer`
    border-top: 1px solid var(--border);
    padding: var(--space-m) var(--space-l);
    background: var(--bg-surface);
    position: sticky;
    bottom: 0;
    z-index: 5;
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
    const [ is_offline, set_is_offline ] = useState( !navigator.onLine )
    const reading_area_ref = useRef( null )
    const suppress_swipe_ref = useRef( false )

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

    // Flatten current chapter + 2 ahead chapters for translation read-ahead
    const all_sentences = useMemo( () => {
        const current = extract_sentences( current_chapter_content )
        const ahead = ahead_chapters_content.flatMap( extract_sentences )
        return [ ...current, ...ahead ]
    }, [ current_chapter_content, ahead_chapters_content ] )

    // Translation hook
    const { translations, is_translating, token_usage } = use_translation( {
        all_sentences,
        target_language: language_chosen ? last_language : null,
        level: language_chosen ? last_level : null,
        source_language,
        book_id
    } )

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

            // Don't navigate when an overlay is open
            const overlay_open = settings_open || explanation_data || show_language_modal

            if( e.key === `ArrowLeft` && !overlay_open ) prev_chapter()
            if( e.key === `ArrowRight` && !overlay_open ) next_chapter()
            if( e.key === `Escape` && !overlay_open ) navigate( `/library` )

        }
        window.addEventListener( `keydown`, handle_key )
        return () => window.removeEventListener( `keydown`, handle_key )
    }, [ prev_chapter, next_chapter, navigate, settings_open, explanation_data, show_language_modal ] )

    // Long-press callback — suppresses the next swipe to avoid accidental chapter nav
    const handle_long_press = useCallback( ( data ) => {
        suppress_swipe_ref.current = true
        set_explanation_data( data )
    }, [] )

    // Swipe navigation for mobile
    const touch_start_ref = useRef( null )

    const handle_touch_start = useCallback( ( e ) => {
        suppress_swipe_ref.current = false
        touch_start_ref.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }, [] )

    const handle_touch_end = useCallback( ( e ) => {
        if( !touch_start_ref.current ) return

        // If a long-press just fired, skip swipe to avoid accidental chapter nav
        if( suppress_swipe_ref.current ) {
            suppress_swipe_ref.current = false
            touch_start_ref.current = null
            return
        }

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

    // Scroll to top and close popover on chapter change
    useEffect( () => {
        if( reading_area_ref.current ) {
            reading_area_ref.current.scrollTo( 0, 0 )
        }
        window.scrollTo( 0, 0 )
        set_explanation_data( null )
    }, [ current_chapter ] )

    // Close explanation popover when language or level changes (stale content)
    useEffect( () => {
        set_explanation_data( null )
    }, [ last_language, last_level ] )

    // Get level info for badge
    const level_info = LEVELS.find( l => l.code === last_level ) || DEFAULT_LEVEL

    // --- Render helpers ---

    // Render sentences with inter-sentence spacing via text node
    const render_sentence = ( sentence, index ) => <Fragment key={ sentence.id }>
        { index > 0 && ` ` }
        <Sentence
            sentence_id={ sentence.id }
            original={ sentence.text }
            translated={ translations[sentence.id] }
            source_language={ source_language }
            target_language={ last_language }
            on_long_press={ handle_long_press }
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

        { /* Settings Drawer */ }
        <SettingsDrawer
            is_open={ settings_open }
            on_close={ () => set_settings_open( false ) }
            show_language={ true }
        />

        { /* Explanation Popover */ }
        { explanation_data && <ExplanationPopover
            original={ explanation_data.original }
            translated={ explanation_data.translated }
            source_language={ source_language }
            target_language={ last_language }
            on_close={ () => set_explanation_data( null ) }
        /> }

    </Page>

}
