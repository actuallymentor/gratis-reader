import { useEffect, useRef } from 'react'

const SCROLL_SETTLE_MS = 150
const BACKGROUND_CONCURRENCY = 2

/**
 * Warms translated words admitted by the shared occurrence window, one request
 * per translated sentence. Dictionary requests deduplicate only after the
 * viewport budget has been applied.
 * @param {Object} options
 * @param {boolean} options.enabled - Opt-in, reader available and online
 * @param {Array} options.words - Ordered window words with their translated sentence context
 * @param {Function} options.lookup_words - Shared context-aware batch lookup
 */
export const use_turbo_lookup = ( { enabled, words, lookup_words } ) => {

    const words_ref = useRef( words )
    words_ref.current = words
    const refresh_ref = useRef( null )

    useEffect( () => {
        if( !enabled ) return

        // context → { queued: Map(key → word), requested: Set(key), controller }
        const jobs = new Map()
        let active = 0
        let stopped = false
        let settling = false
        let timer

        const cancel_jobs = () => {
            jobs.forEach( job => job.controller.abort() )
            jobs.clear()
        }

        const pump = () => {
            if( stopped || settling || document.hidden ) return

            // Reserve a slot under the shared three-request ceiling for foreground taps.
            while( active < BACKGROUND_CONCURRENCY ) {
                const entry = [ ...jobs.entries() ].find( ( [ , job ] ) =>
                    [ ...job.queued.keys() ].some( key => !job.requested.has( key ) )
                )
                if( !entry ) return
                const [ context, job ] = entry
                const batch = [ ...job.queued.entries() ].filter( ( [ key ] ) => !job.requested.has( key ) )
                batch.forEach( ( [ key ] ) => job.requested.add( key ) )
                active += 1
                lookup_words( batch.map( ( [ , word ] ) => word.text ), {
                    context,
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
                if( !selected.get( word.context ).has( key ) ) selected.get( word.context ).set( key, word )
            } )
            // Sentences that left the window are abandoned, including their in-flight request.
            jobs.forEach( ( job, context ) => {
                if( !selected.has( context ) ) {
                    job.controller.abort()
                    jobs.delete( context )
                }
            } )
            // Reorder as well: newly visible sentences take priority after scrolling back.
            const ordered = new Map()
            selected.forEach( ( queued, context ) => {
                const job = jobs.get( context ) || { queued: new Map(), requested: new Set(), controller: new AbortController() }
                job.queued = queued
                ordered.set( context, job )
            } )
            jobs.clear()
            ordered.forEach( ( job, context ) => jobs.set( context, job ) )
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
    }, [ enabled, lookup_words ] )

    useEffect( () => refresh_ref.current?.(), [ words ] )

}
