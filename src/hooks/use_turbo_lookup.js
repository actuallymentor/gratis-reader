import { useEffect, useRef } from 'react'

const SCROLL_SETTLE_MS = 150
const BACKGROUND_CONCURRENCY = 2

/**
 * Warms translated words admitted by the shared occurrence window.
 * Dictionary requests deduplicate only after the viewport budget has been applied.
 * @param {Object} options
 * @param {boolean} options.enabled - Opt-in, reader available and online
 * @param {Array} options.words - Ordered window words with their translated sentence context
 * @param {Function} options.lookup_word - Shared context-aware foreground lookup
 */
export const use_turbo_lookup = ( { enabled, words, lookup_word } ) => {

    const words_ref = useRef( words )
    words_ref.current = words
    const refresh_ref = useRef( null )

    useEffect( () => {
        if( !enabled ) return

        const jobs = new Map()
        let active = 0
        let stopped = false
        let settling = false
        let timer

        const all_jobs = () => [ ...jobs.values() ].flatMap( context_jobs => [ ...context_jobs.values() ] )

        const cancel_jobs = () => {
            all_jobs().forEach( job => job.controller.abort() )
            jobs.clear()
        }

        const pump = () => {
            if( stopped || settling || document.hidden ) return

            // Reserve a slot under the shared three-request ceiling for foreground taps.
            while( active < BACKGROUND_CONCURRENCY ) {
                const job = all_jobs().find( candidate => !candidate.started )
                if( !job ) return
                job.started = true
                active += 1
                lookup_word( job.word.text, {
                    context: job.word.context,
                    retry: false,
                    signal: job.controller.signal
                } ).catch( () => {} ).finally( () => {
                    active -= 1
                    pump()
                } )
            }
        }

        const refresh = () => {
            if( document.hidden ) return cancel_jobs()
            // Store a long sentence context once, rather than duplicating it in every word key.
            const selected = new Map()
            words_ref.current.filter( word => word.context ).forEach( word => {
                if( !selected.has( word.context ) ) selected.set( word.context, new Map() )
                const key = word.text.toLowerCase()
                if( selected.get( word.context ).has( key ) ) return
                const job = jobs.get( word.context )?.get( key )
                    || { word, controller: new AbortController(), started: false }
                selected.get( word.context ).set( key, job )
            } )
            jobs.forEach( ( context_jobs, context ) => context_jobs.forEach( ( job, key ) => {
                if( !selected.get( context )?.has( key ) ) job.controller.abort()
            } ) )
            // Reorder surviving jobs as well: newly visible words take priority after scrolling back.
            jobs.clear()
            selected.forEach( ( context_jobs, context ) => jobs.set( context, context_jobs ) )
            pump()
        }
        refresh_ref.current = refresh
        refresh()

        const pause = () => {
            settling = true
            clearTimeout( timer )
            // The window scanner runs first; defer pumping until its React update has committed.
            timer = setTimeout( () => {
                settling = false
                refresh()
            }, SCROLL_SETTLE_MS + 50 )
        }
        window.addEventListener( `scroll`, pause, true )
        window.addEventListener( `resize`, pause )
        document.addEventListener( `visibilitychange`, refresh )

        return () => {
            stopped = true
            clearTimeout( timer )
            refresh_ref.current = null
            cancel_jobs()
            window.removeEventListener( `scroll`, pause, true )
            window.removeEventListener( `resize`, pause )
            document.removeEventListener( `visibilitychange`, refresh )
        }
    }, [ enabled, lookup_word ] )

    useEffect( () => refresh_ref.current?.(), [ words ] )

}
