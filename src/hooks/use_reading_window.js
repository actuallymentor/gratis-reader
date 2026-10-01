import { useEffect, useMemo, useRef } from 'react'
import { segment_translation_text } from '../modules/translation_alignment.js'

const SCROLL_SETTLE_MS = 150
const words_in = text => segment_translation_text( text ).filter( segment => segment.is_word )

/**
 * Measures visible word occurrences and admits the next twice that count in reading order.
 * Untranslated text supplies the initial geometry/budget; translated text replaces it on reflow.
 * @param {Object} options - Reader DOM refs, ordered sentences, translations and window state setter
 */
export const use_reading_window = ( {
    enabled, content_key, reading_area_ref, reader_dock_ref, all_sentences, translations, on_change
} ) => {

    // Every translation batch replaces `translations`; only rebuild the sentences whose text changed.
    const sentence_words_ref = useRef( new Map() )
    const words = useMemo( () => {
        const previous_entries = sentence_words_ref.current
        const next_entries = new Map()

        const ordered = all_sentences.flatMap( sentence => {
            const context = translations[sentence.id] || null
            const text = context || sentence.text
            const previous = previous_entries.get( sentence.id )
            // A translation can equal its source text, so the context itself is part of the key.
            const entry = previous?.text === text && previous?.context === context ? previous : {
                text,
                context,
                words: words_in( text ).map( word => ( {
                    sentence_id: sentence.id,
                    word_index: word.word_index,
                    text: word.text,
                    context
                } ) )
            }
            next_entries.set( sentence.id, entry )
            return entry.words
        } )

        sentence_words_ref.current = next_entries
        return ordered
    }, [ all_sentences, translations ] )

    // Scans resolve visible DOM words back to window positions; index once per word list.
    const word_positions = useMemo( () => new Map(
        words.map( ( word, index ) => [ `${ word.sentence_id }:${ word.word_index }`, index ] )
    ), [ words ] )
    const source_word_counts = useMemo( () => new Map(
        all_sentences.map( sentence => [ sentence.id, words_in( sentence.text ).length ] )
    ), [ all_sentences ] )
    const latest = useRef( null )
    latest.current = { words, word_positions, source_word_counts, all_sentences }
    const request_scan_ref = useRef( null )

    useEffect( () => {
        let timer
        let previous_words
        let previous_budget

        const publish = ( selected, ahead_word_budget = 0 ) => {
            // Compare references/values without copying long sentence contexts once per word.
            const unchanged = previous_budget === ahead_word_budget && previous_words?.length === selected.length
                && selected.every( ( word, index ) => {
                    const previous = previous_words[index]
                    return word.sentence_id === previous.sentence_id && word.word_index === previous.word_index
                        && word.text === previous.text && word.context === previous.context
                } )
            if( unchanged ) return
            previous_words = selected
            previous_budget = ahead_word_budget
            const sentence_ids = [ ...new Set( selected.map( word => word.sentence_id ) ) ]
            on_change( previous => ( {
                // Word-only reflow does not change sentence admission.
                sentence_ids: previous.sentence_ids.length === sentence_ids.length
                    && sentence_ids.every( ( id, index ) => id === previous.sentence_ids[index] )
                    ? previous.sentence_ids : sentence_ids,
                words: selected,
                content_key,
                ahead_word_budget
            } ) )
        }

        const scan = () => {
            timer = null
            const area = reading_area_ref.current
            if( !enabled || document.hidden || !area ) return publish( [] )

            const top = Math.max( 0, document.querySelector( `header` )?.getBoundingClientRect().bottom || 0 )
            const bottom = Math.min( window.innerHeight, reader_dock_ref.current?.getBoundingClientRect().top ?? window.innerHeight )
            if( bottom <= top ) return publish( [] )
            const in_viewport = rect => rect.width > 0 && rect.height > 0 && rect.bottom > top && rect.top < bottom
                && rect.right > 0 && rect.left < window.innerWidth
            const intersects = element => [ ...element.getClientRects() ].some( in_viewport )
            const { words: ordered, word_positions: positions, source_word_counts, all_sentences: sentences } = latest.current
            const visible_indexes = []
            const current_ids = new Set()
            const sentence_elements = area.querySelectorAll( `[data-sentence-id]` )
            let passed_viewport = false
            sentence_elements.forEach( sentence => {
                current_ids.add( sentence.dataset.sentenceId )
                if( passed_viewport ) return
                const rects = [ ...sentence.getClientRects() ]
                if( !rects.some( in_viewport ) ) {
                    // Sentences flow top to bottom: once one sits fully below the viewport, the rest do too.
                    passed_viewport = visible_indexes.length > 0 && rects.length > 0 && rects.every( rect => rect.top >= bottom )
                    return
                }
                sentence.querySelectorAll( `[data-reading-word-index]` ).forEach( word => {
                    if( !intersects( word ) ) return
                    const index = positions.get( `${ sentence.dataset.sentenceId }:${ word.dataset.readingWordIndex }` )
                    if( index !== undefined ) visible_indexes.push( index )
                } )
            } )
            visible_indexes.sort( ( a, b ) => a - b )
            if( !visible_indexes.length ) return publish( [] )

            // Count occurrences before cache checks or dictionary deduplication.
            const last_visible = visible_indexes.at( -1 )
            const ahead_count = visible_indexes.length * 2
            const following = ordered.slice( last_visible + 1 )
            const selected = [
                ...visible_indexes.map( index => ordered[index] ),
                ...following.slice( 0, ahead_count )
            ]
            const current_remaining = following.filter( word => current_ids.has( word.sentence_id ) ).length
            const needed_from_chapters = Math.max( 0, ahead_count - current_remaining )
            const ahead_source_count = sentences.filter( sentence => !current_ids.has( sentence.id ) )
                .reduce( ( count, sentence ) => count + ( source_word_counts.get( sentence.id ) || 0 ), 0 )
            const ahead_display_count = following.length - current_remaining
            // Translations can contract: ask the EPUB loader for enough source words to fill the gap.
            const ahead_word_budget = needed_from_chapters
                ? needed_from_chapters + Math.max( 0, ahead_source_count - ahead_display_count )
                : 0
            publish( selected, ahead_word_budget )
        }

        const schedule_scan = () => {
            clearTimeout( timer )
            timer = setTimeout( scan, SCROLL_SETTLE_MS )
        }
        const request_scan = () => {
            if( !timer ) schedule_scan()
        }
        request_scan_ref.current = request_scan
        const visibility_changed = () => {
            if( !document.hidden ) return request_scan()
            clearTimeout( timer )
            scan()
        }
        const observer = new ResizeObserver( request_scan )
        if( reading_area_ref.current ) observer.observe( reading_area_ref.current )
        if( reader_dock_ref.current ) observer.observe( reader_dock_ref.current )
        window.addEventListener( `scroll`, schedule_scan, true )
        window.addEventListener( `resize`, schedule_scan )
        document.addEventListener( `visibilitychange`, visibility_changed )
        if( enabled ) request_scan()
        else publish( [] )

        return () => {
            clearTimeout( timer )
            request_scan_ref.current = null
            observer.disconnect()
            window.removeEventListener( `scroll`, schedule_scan, true )
            window.removeEventListener( `resize`, schedule_scan )
            document.removeEventListener( `visibilitychange`, visibility_changed )
        }
    }, [ enabled, content_key, reading_area_ref, reader_dock_ref, on_change ] )

    useEffect( () => request_scan_ref.current?.(), [ words ] )

}
