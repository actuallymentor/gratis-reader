import { useState, useRef, useCallback, useEffect } from 'react'
import { chat_completion } from '../modules/open_router.js'
import { build_word_lookup_prompt, build_word_batch_prompt } from '../modules/prompts.js'
import { extract_string_array } from '../modules/llm_json.js'
import { use_settings_store } from '../stores/settings_store.js'
import { use_cache } from './use_cache.js'

const WORD_BOUNDARY_PUNCTUATION_RE = /(^[\p{P}\p{S}]+)|([\p{P}\p{S}]+$)/gu
const WORD_WITH_LETTERS_RE = /\p{L}/u
// Glosses are a few bytes each. The limit must stay well above Turbo's working set (several
// hundred words on a tall screen), or prefetching evicts glosses still on screen and refetches them.
const WORD_LOOKUP_MEMORY_LIMIT = 5_000
const WORD_LOOKUP_CONCURRENCY = 3
// Runaway guard only: a gloss is a few tokens, but reasoning models bill their thinking
const WORD_LOOKUP_MAX_TOKENS = 4_000
const word_batch_max_tokens = count => count * 16 + WORD_LOOKUP_MAX_TOKENS
const LOOKUP_CANCELLED = Symbol( `lookup_cancelled` )

// Rate limits and server outages are worth waiting out; anything else means the request shape itself failed
const is_retryable_outage = error => error?.status === 429 || error?.status >= 500 || error?.name === `TypeError`

// A tap can join a prefetch. One caller leaving must not abort work the other still needs.
const wait_for_lookup = ( task, signal ) => {
    const consumer = {}
    task.consumers.add( consumer )
    const unsubscribe = () => {
        task.consumers.delete( consumer )
        if( task.consumers.size || task.settled ) return
        task.cancelled = true
        task.controller?.abort()
    }
    signal?.addEventListener( `abort`, unsubscribe, { once: true } )

    return task.promise.finally( () => {
        signal?.removeEventListener( `abort`, unsubscribe )
        task.consumers.delete( consumer )
    } )
}

/**
 * Normalizes a visible word before dictionary lookup.
 * @param {string} word
 * @returns {string}
 */
export const clean_lookup_word = ( word ) => {
    const clean_word = String( word || `` ).trim().replace( WORD_BOUNDARY_PUNCTUATION_RE, `` )
    return WORD_WITH_LETTERS_RE.test( clean_word ) ? clean_word : ``
}

/**
 * Builds the stable lookup cache key used by word tooltips.
 * @param {string} word
 * @param {string} source_language
 * @param {string} target_language
 * @param {string} [lookup_context] - Optional context that scopes ambiguous translations
 * @returns {string}
 */
export const word_cache_key = ( word, source_language, target_language, lookup_context = `` ) => {
    const context_suffix = lookup_context ? `:${ encodeURIComponent( lookup_context ) }` : ``
    return `${ clean_lookup_word( word ).toLowerCase() }:${ source_language }:${ target_language }${ context_suffix }`
}

/**
 * Looks up target-language words and caches their source-language equivalents.
 * @param {Object} options
 * @param {string} options.source_language
 * @param {string} options.target_language
 * @param {string} options.sentence_context
 * @param {boolean} [options.cache_by_context] - Prevents ambiguous words sharing translations across fragments
 * @param {boolean} [options.is_online] - Allows cached lookup while suppressing offline requests
 * @param {Function} [options.on_usage] - Records paid lookup usage, including background work
 * @returns {Object} Lookups accept an optional context override for viewport preloading.
 */
export const use_word_lookup = ( {
    source_language,
    target_language,
    sentence_context,
    cache_by_context = false,
    is_online = typeof navigator === `undefined` || navigator.onLine,
    on_usage
} ) => {

    const [ , set_lookup_version ] = useState( 0 )
    const word_translations_ref = useRef( {} )
    const loading_words_ref = useRef( {} )
    const lookup_errors_ref = useRef( {} )
    const word_abort_ref = useRef( {} )
    const lookup_tasks_ref = useRef( {} )
    const lookup_keys_ref = useRef( [] )
    const active_lookup_count_ref = useRef( 0 )
    const lookup_waiters_ref = useRef( [] )
    const mounted_ref = useRef( true )
    const api_key = use_settings_store( state => state.api_key )
    const model = use_settings_store( state => state.model )
    const { get_word_translation, get_word_translations, cache_word_translation } = use_cache()
    const lookup_context = cache_by_context ? sentence_context : ``
    const default_context_ref = useRef( sentence_context )
    default_context_ref.current = sentence_context

    // Turbo settles hundreds of lookups per screen; coalesce their re-renders to one per frame.
    const refresh_frame_ref = useRef( null )
    const refresh_lookup_state = useCallback( () => {
        if( refresh_frame_ref.current !== null ) return
        refresh_frame_ref.current = requestAnimationFrame( () => {
            refresh_frame_ref.current = null
            if( mounted_ref.current ) set_lookup_version( version => version + 1 )
        } )
    }, [] )

    const remember_lookup_key = useCallback( ( cache_key ) => {
        const ordered_keys = lookup_keys_ref.current.filter( key => key !== cache_key )
        ordered_keys.push( cache_key )

        // The open sentence's glosses are never evicted: the sheet shows every one of them
        const open_context = cache_by_context && default_context_ref.current
        const pinned_suffix = open_context ? `:${ encodeURIComponent( open_context ) }` : null
        const is_pinned = key => pinned_suffix && key.endsWith( pinned_suffix )

        // Walk from the oldest key and evict until back under the limit, skipping keys that
        // are pinned or still in flight, so the cap holds even when the oldest keys are pinned.
        let excess = ordered_keys.length - WORD_LOOKUP_MEMORY_LIMIT
        const pruned_keys = []
        for( const key of ordered_keys ) {
            if( excess <= 0 ) break
            if( is_pinned( key ) || loading_words_ref.current[key] ) continue
            pruned_keys.push( key )
            excess -= 1
        }

        const evicted = new Set( pruned_keys )
        lookup_keys_ref.current = ordered_keys.filter( key => !evicted.has( key ) )

        if( pruned_keys.length === 0 ) return

        const prune_store = ( store ) => {
            const next_store = { ...store }
            pruned_keys.forEach( key => delete next_store[key] )
            return next_store
        }

        word_translations_ref.current = prune_store( word_translations_ref.current )
        loading_words_ref.current = prune_store( loading_words_ref.current )
        lookup_errors_ref.current = prune_store( lookup_errors_ref.current )
    }, [ cache_by_context ] )

    const acquire_lookup_slot = useCallback( () => new Promise( resolve => {
        const start_lookup = () => {
            active_lookup_count_ref.current += 1
            resolve()
        }

        if( active_lookup_count_ref.current < WORD_LOOKUP_CONCURRENCY ) start_lookup()
        else lookup_waiters_ref.current = [ ...lookup_waiters_ref.current, start_lookup ]
    } ), [] )

    const release_lookup_slot = useCallback( () => {
        active_lookup_count_ref.current = Math.max( 0, active_lookup_count_ref.current - 1 )
        const [ next_lookup, ...remaining_lookups ] = lookup_waiters_ref.current
        lookup_waiters_ref.current = remaining_lookups
        next_lookup?.()
    }, [] )

    const cancel_lookups = useCallback( () => {
        Object.values( lookup_tasks_ref.current ).forEach( task => {
            task.cancelled = true
            task.controller?.abort()
        } )
    }, [] )

    const lookup_word = useCallback( async ( word, { retry = true, signal, context = default_context_ref.current } = {} ) => {

        const clean_word = clean_lookup_word( word )
        if( !clean_word || !api_key || !mounted_ref.current || signal?.aborted ) return

        const lookup_context = cache_by_context ? context : ``
        const cache_key = word_cache_key( clean_word, source_language, target_language, lookup_context )

        if( word_translations_ref.current[cache_key] ) return

        if( loading_words_ref.current[cache_key] ) {
            const result = await wait_for_lookup( lookup_tasks_ref.current[cache_key], signal )
            if( result === LOOKUP_CANCELLED && !signal?.aborted ) {
                return lookup_word( word, { retry, signal, context } )
            }
            return
        }

        if( lookup_errors_ref.current[cache_key] && !retry ) return

        loading_words_ref.current = { ...loading_words_ref.current, [cache_key]: true }
        lookup_errors_ref.current = { ...lookup_errors_ref.current, [cache_key]: false }
        refresh_lookup_state()

        const clear_loading_word = () => {
            const next_loading_words = { ...loading_words_ref.current }
            delete next_loading_words[cache_key]
            loading_words_ref.current = next_loading_words
        }

        const task = { cancelled: false, settled: false, consumers: new Set(), controller: null, promise: null }
        lookup_tasks_ref.current = { ...lookup_tasks_ref.current, [cache_key]: task }

        const run_lookup = async () => {
            let slot_acquired = false
            let refresh_in_finally = true

            try {
                await acquire_lookup_slot()
                slot_acquired = true

                if( task.cancelled || !mounted_ref.current ) return LOOKUP_CANCELLED

                const controller = new AbortController()
                task.controller = controller
                word_abort_ref.current = { ...word_abort_ref.current, [cache_key]: controller }

                const cached = await get_word_translation(
                    clean_word,
                    source_language,
                    target_language,
                    lookup_context
                )
                if( controller.signal.aborted || task.cancelled ) return LOOKUP_CANCELLED

                if( cached ) {
                    word_translations_ref.current = { ...word_translations_ref.current, [cache_key]: cached }
                    remember_lookup_key( cache_key )
                    return
                }

                if( !is_online ) return

                const { system, user } = build_word_lookup_prompt( clean_word, source_language, target_language, context )
                const { content, usage } = await chat_completion( {
                    api_key,
                    model,
                    system_prompt: system,
                    user_message: user,
                    temperature: 0.1,
                    max_tokens: WORD_LOOKUP_MAX_TOKENS,
                    signal: controller.signal
                } )

                on_usage?.( usage )
                if( task.cancelled || controller.signal.aborted ) return LOOKUP_CANCELLED

                word_translations_ref.current = { ...word_translations_ref.current, [cache_key]: content }
                remember_lookup_key( cache_key )
                clear_loading_word()
                refresh_lookup_state()
                refresh_in_finally = false

                try {
                    await cache_word_translation(
                        clean_word,
                        source_language,
                        target_language,
                        content,
                        lookup_context
                    )
                } catch {
                    // Cache writes should not invalidate a successful lookup.
                }
            } catch ( error ) {
                // An empty answer was still billed
                if( error?.usage ) on_usage?.( error.usage )
                // Word lookups are opportunistic; the reading flow should never break on lookup failure.
                if( task.cancelled || error?.name === `AbortError` ) return LOOKUP_CANCELLED

                lookup_errors_ref.current = { ...lookup_errors_ref.current, [cache_key]: true }
                remember_lookup_key( cache_key )
            } finally {
                task.settled = true
                if( word_abort_ref.current[cache_key] === task.controller ) {
                    const remaining_controllers = { ...word_abort_ref.current }
                    delete remaining_controllers[cache_key]
                    word_abort_ref.current = remaining_controllers
                }

                if( lookup_tasks_ref.current[cache_key] === task ) {
                    const remaining_tasks = { ...lookup_tasks_ref.current }
                    delete remaining_tasks[cache_key]
                    lookup_tasks_ref.current = remaining_tasks
                }

                if( refresh_in_finally ) {
                    clear_loading_word()
                    refresh_lookup_state()
                }

                if( slot_acquired ) release_lookup_slot()
            }
        }

        task.promise = run_lookup()
        return wait_for_lookup( task, signal )

    }, [
        api_key,
        model,
        source_language,
        target_language,
        cache_by_context,
        is_online,
        on_usage,
        get_word_translation,
        cache_word_translation,
        remember_lookup_key,
        refresh_lookup_state,
        acquire_lookup_slot,
        release_lookup_slot
    ] )

    // Look up every word of one sentence in a single request. Words the answer
    // does not cover fall back to single lookups; cache keys stay per word.
    const lookup_words = useCallback( async ( words, { signal, context = default_context_ref.current } = {} ) => {

        if( !api_key || !mounted_ref.current || signal?.aborted ) return

        const lookup_context = cache_by_context ? context : ``
        const seen = new Set()
        const candidates = []
        const joined_tasks = new Set()
        words.forEach( word => {
            const clean_word = clean_lookup_word( word )
            if( !clean_word ) return
            const cache_key = word_cache_key( clean_word, source_language, target_language, lookup_context )
            if( seen.has( cache_key ) ) return
            seen.add( cache_key )
            if( word_translations_ref.current[cache_key] || lookup_errors_ref.current[cache_key] ) return
            // Words another request already owns are joined, so this caller keeps them alive too
            if( loading_words_ref.current[cache_key] ) {
                const owner = lookup_tasks_ref.current[cache_key]
                if( owner ) joined_tasks.add( owner )
                return
            }
            candidates.push( { word: clean_word, cache_key } )
        } )

        const join_existing = async () => {
            const outcomes = await Promise.all( [ ...joined_tasks ].map( task => wait_for_lookup( task, signal ) ) )
            // An owner that gave up (deselection) leaves our words unresolved: pick them up ourselves
            if( outcomes.includes( LOOKUP_CANCELLED ) && !signal?.aborted ) return lookup_words( words, { signal, context } )
        }
        if( !candidates.length ) return joined_tasks.size ? join_existing() : undefined

        // One shared task: taps joining any of these words wait on the same request
        const task = { cancelled: false, settled: false, consumers: new Set(), controller: null, promise: null }
        const next_loading = { ...loading_words_ref.current }
        const next_errors = { ...lookup_errors_ref.current }
        const next_tasks = { ...lookup_tasks_ref.current }
        candidates.forEach( ( { cache_key } ) => {
            next_loading[cache_key] = true
            next_errors[cache_key] = false
            next_tasks[cache_key] = task
        } )
        loading_words_ref.current = next_loading
        lookup_errors_ref.current = next_errors
        lookup_tasks_ref.current = next_tasks
        refresh_lookup_state()

        const forget = ( keys ) => {
            const remaining_loading = { ...loading_words_ref.current }
            const remaining_tasks = { ...lookup_tasks_ref.current }
            keys.forEach( key => {
                delete remaining_loading[key]
                if( remaining_tasks[key] === task ) delete remaining_tasks[key]
            } )
            loading_words_ref.current = remaining_loading
            lookup_tasks_ref.current = remaining_tasks
        }
        const remember = ( cache_key, content ) => {
            word_translations_ref.current = { ...word_translations_ref.current, [cache_key]: content }
            remember_lookup_key( cache_key )
        }

        const run_lookup = async () => {
            let slot_acquired = false
            const fallback = []
            let outstanding = candidates
            const controller = new AbortController()
            task.controller = controller

            try {
                await acquire_lookup_slot()
                slot_acquired = true
                if( task.cancelled || !mounted_ref.current ) return LOOKUP_CANCELLED

                const cached = await get_word_translations( candidates.map( c => c.word ), source_language, target_language, lookup_context )
                if( controller.signal.aborted || task.cancelled ) return LOOKUP_CANCELLED

                outstanding = candidates.filter( ( { word, cache_key } ) => {
                    if( !cached[word] ) return true
                    remember( cache_key, cached[word] )
                    return false
                } )
                forget( candidates.filter( c => !outstanding.includes( c ) ).map( c => c.cache_key ) )
                if( !outstanding.length || !is_online ) return

                const { system, user } = build_word_batch_prompt( outstanding.map( c => c.word ), source_language, target_language, context )
                const { content, usage } = await chat_completion( {
                    api_key, model, system_prompt: system, user_message: user, temperature: 0.1, json: true,
                    max_tokens: word_batch_max_tokens( outstanding.length ), signal: controller.signal
                } )
                on_usage?.( usage )
                if( task.cancelled || controller.signal.aborted ) return LOOKUP_CANCELLED

                const glosses = extract_string_array( content, `glosses`, outstanding.length )
                outstanding.forEach( ( candidate, index ) => {
                    const gloss = glosses?.[index]
                    if( !gloss ) return fallback.push( candidate )
                    remember( candidate.cache_key, gloss )
                    cache_word_translation( candidate.word, source_language, target_language, gloss, lookup_context ).catch( () => {} )
                } )
                forget( outstanding.filter( c => !fallback.includes( c ) ).map( c => c.cache_key ) )
                // The single-word prompt handles what the batch could not
                forget( fallback.map( c => c.cache_key ) )
            } catch ( error ) {
                if( error?.usage ) on_usage?.( error.usage )
                if( task.cancelled || error?.name === `AbortError` ) return LOOKUP_CANCELLED

                if( is_retryable_outage( error ) ) {
                    const failed_errors = { ...lookup_errors_ref.current }
                    outstanding.forEach( ( { cache_key } ) => {
                        failed_errors[cache_key] = true
                        remember_lookup_key( cache_key )
                    } )
                    lookup_errors_ref.current = failed_errors
                } else {
                    // A provider that rejects the batch shape can still answer single words
                    fallback.push( ...outstanding )
                    forget( outstanding.map( c => c.cache_key ) )
                }
            } finally {
                forget( candidates.map( c => c.cache_key ) )
                refresh_lookup_state()
                if( slot_acquired ) release_lookup_slot()
            }

            // Fallbacks belong to this task: joined taps keep them alive, and a cancelled
            // fallback reports as cancelled so a waiting tap retries instead of hanging.
            try {
                for( const { word } of fallback ) {
                    if( task.cancelled ) return LOOKUP_CANCELLED
                    const outcome = await lookup_word( word, { retry: false, signal: controller.signal, context } )
                    if( outcome === LOOKUP_CANCELLED && task.cancelled ) return LOOKUP_CANCELLED
                }
            } finally {
                task.settled = true
            }
        }

        task.promise = run_lookup()
        const own_result = wait_for_lookup( task, signal )
        if( !joined_tasks.size ) return own_result
        const [ result ] = await Promise.all( [ own_result, join_existing() ] )
        return result

    }, [
        api_key, model, source_language, target_language, cache_by_context, is_online, on_usage,
        get_word_translations, cache_word_translation, remember_lookup_key, refresh_lookup_state,
        acquire_lookup_slot, release_lookup_slot, lookup_word
    ] )

    const get_lookup_state = useCallback( ( word ) => {
        const cache_key = word_cache_key( word, source_language, target_language, lookup_context )

        return {
            cache_key,
            content: word_translations_ref.current[cache_key],
            loading: !!loading_words_ref.current[cache_key],
            error: !!lookup_errors_ref.current[cache_key],
            can_lookup: !!api_key && is_online
        }
    }, [ source_language, target_language, lookup_context, api_key, is_online ] )

    useEffect( () => () => cancel_lookups(), [ api_key, model, source_language, target_language, cancel_lookups ] )

    useEffect( () => {
        if( !is_online ) cancel_lookups()
    }, [ is_online, cancel_lookups ] )

    useEffect( () => {
        mounted_ref.current = true

        return () => {
            mounted_ref.current = false
            cancel_lookups()
            word_abort_ref.current = {}
            if( refresh_frame_ref.current !== null ) cancelAnimationFrame( refresh_frame_ref.current )
            refresh_frame_ref.current = null
        }
    }, [ cancel_lookups ] )

    return { lookup_word, lookup_words, get_lookup_state, cancel_lookups }

}
