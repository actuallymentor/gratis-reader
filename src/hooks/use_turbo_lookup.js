import { useEffect, useRef } from 'react'
import { segment_translation_text } from '../modules/translation_alignment.js'

const SCROLL_SETTLE_MS = 150
const BACKGROUND_CONCURRENCY = 2

/**
 * Warms the shared word cache for visible translated sentences after scrolling settles.
 * Whole visible sentences are needed because a tap opens their complete word-by-word sheet.
 * @param {Object} options
 * @param {boolean} options.enabled - Confirmed opt-in, with the reader available and online
 * @param {Object} options.reading_area_ref
 * @param {Object} options.reader_dock_ref
 * @param {Object} options.translations - Sentence ID to translated text
 * @param {*} options.content_key - Changes when rendered chapter content changes
 * @param {Function} options.lookup_word - Shared, context-aware foreground lookup
 */
export const use_turbo_lookup = ( { enabled, reading_area_ref, reader_dock_ref, translations, content_key, lookup_word } ) => {

    const translations_ref = useRef( translations )
    translations_ref.current = translations
    const schedule_scan_ref = useRef( null )

    useEffect( () => {
        if( !enabled ) return

        const jobs = new Map()
        let active = 0
        let stopped = false
        let scan_pending = false
        let scan_timer

        const cancel_jobs = () => {
            jobs.forEach( job => job.controller.abort() )
            jobs.clear()
        }

        const pump = () => {
            if( stopped || scan_pending || document.hidden ) return

            // Leave room under the shared three-request ceiling for a tapped word.
            while( active < BACKGROUND_CONCURRENCY ) {
                const job = [ ...jobs.values() ].find( candidate => candidate.words.length )
                if( !job ) return

                const word = job.words.shift()
                active += 1
                lookup_word( word, {
                    context: job.context,
                    retry: false,
                    signal: job.controller.signal
                } ).catch( () => {} ).finally( () => {
                    active -= 1
                    pump()
                } )
            }
        }

        const scan = () => {
            scan_timer = null
            scan_pending = false
            if( stopped ) return
            if( document.hidden ) {
                cancel_jobs()
                return
            }

            const area = reading_area_ref.current
            const header = area?.closest( `main` )?.querySelector( `header` )
                || document.querySelector( `header` )
            const top = Math.max( 0, header?.getBoundingClientRect().bottom || 0 )
            const bottom = Math.min( window.innerHeight, reader_dock_ref.current?.getBoundingClientRect().top ?? window.innerHeight )
            const contexts = new Set()

            area?.querySelectorAll( `[data-sentence-id]` ).forEach( element => {
                const context = translations_ref.current[element.dataset.sentenceId]
                if( !context ) return

                // Inline fragments can wrap; a union bounding box includes blank space.
                const visible = [ ...element.getClientRects() ].some( rect =>
                    rect.width > 0 && rect.height > 0 && rect.bottom > top && rect.top < bottom
                        && rect.right > 0 && rect.left < window.innerWidth
                )
                if( visible ) contexts.add( context )
            } )

            jobs.forEach( ( job, context ) => {
                if( contexts.has( context ) ) return
                job.controller.abort()
                jobs.delete( context )
            } )

            contexts.forEach( context => {
                if( jobs.has( context ) ) return
                const words = segment_translation_text( context )
                    .filter( segment => segment.is_word )
                    .map( segment => segment.text )
                // Deduplicate case-insensitively, but preserve casing in the dictionary prompt.
                const unique_words = [ ...new Map( words.map( word => [ word.toLowerCase(), word ] ) ).values() ]
                jobs.set( context, { context, words: unique_words, controller: new AbortController() } )
            } )

            pump()
        }

        const schedule_scan = () => {
            // Stop dequeuing immediately during scrolling; keep in-flight results reusable.
            scan_pending = true
            clearTimeout( scan_timer )
            scan_timer = setTimeout( scan, SCROLL_SETTLE_MS )
        }
        // Translation/layout updates must not postpone work indefinitely while a chapter streams in.
        const request_scan = () => {
            if( !scan_timer ) schedule_scan()
        }
        const visibility_changed = () => document.hidden ? cancel_jobs() : request_scan()
        schedule_scan_ref.current = request_scan
        request_scan()

        const observer = new ResizeObserver( request_scan )
        if( reading_area_ref.current ) observer.observe( reading_area_ref.current )
        if( reader_dock_ref.current ) observer.observe( reader_dock_ref.current )
        window.addEventListener( `scroll`, schedule_scan, true )
        window.addEventListener( `resize`, schedule_scan )
        document.addEventListener( `visibilitychange`, visibility_changed )

        return () => {
            stopped = true
            clearTimeout( scan_timer )
            schedule_scan_ref.current = null
            cancel_jobs()
            observer.disconnect()
            window.removeEventListener( `scroll`, schedule_scan, true )
            window.removeEventListener( `resize`, schedule_scan )
            document.removeEventListener( `visibilitychange`, visibility_changed )
        }
    }, [ enabled, reading_area_ref, reader_dock_ref, lookup_word ] )

    // Newly translated sentences join the current queue without restarting paid work.
    useEffect( () => schedule_scan_ref.current?.(), [ translations, content_key ] )

}
