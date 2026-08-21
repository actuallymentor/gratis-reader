import { useState, useRef, useCallback, useEffect } from 'react'
import { chat_completion } from '../modules/open_router.js'
import { build_word_lookup_prompt } from '../modules/prompts.js'
import { use_settings_store } from '../stores/settings_store.js'
import { use_cache } from './use_cache.js'

const WORD_BOUNDARY_PUNCTUATION_RE = /(^[\p{P}\p{S}]+)|([\p{P}\p{S}]+$)/gu
const WORD_WITH_LETTERS_RE = /\p{L}/u
const WORD_LOOKUP_MEMORY_LIMIT = 250
const WORD_LOOKUP_CONCURRENCY = 3
const LOOKUP_CANCELLED = Symbol( `lookup_cancelled` )

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
 * @returns {Object}
 */
export const use_word_lookup = ( {
    source_language,
    target_language,
    sentence_context,
    cache_by_context = false,
    is_online = typeof navigator === `undefined` || navigator.onLine
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
    const { get_word_translation, cache_word_translation } = use_cache()
    const lookup_context = cache_by_context ? sentence_context : ``

    const refresh_lookup_state = useCallback( () => {
        if( mounted_ref.current ) set_lookup_version( version => version + 1 )
    }, [] )

    const remember_lookup_key = useCallback( ( cache_key ) => {
        const ordered_keys = lookup_keys_ref.current.filter( key => key !== cache_key )
        ordered_keys.push( cache_key )

        const evicted_keys = ordered_keys.slice( 0, Math.max( 0, ordered_keys.length - WORD_LOOKUP_MEMORY_LIMIT ) )
        const loading_evicted_keys = evicted_keys.filter( key => loading_words_ref.current[key] )
        const pruned_keys = evicted_keys.filter( key => !loading_words_ref.current[key] )

        // Keep any future in-flight keys visible until their request settles.
        lookup_keys_ref.current = [
            ...loading_evicted_keys,
            ...ordered_keys.slice( -WORD_LOOKUP_MEMORY_LIMIT )
        ]

        if( pruned_keys.length === 0 ) return

        const prune_store = ( store ) => {
            const next_store = { ...store }
            pruned_keys.forEach( key => delete next_store[key] )
            return next_store
        }

        word_translations_ref.current = prune_store( word_translations_ref.current )
        loading_words_ref.current = prune_store( loading_words_ref.current )
        lookup_errors_ref.current = prune_store( lookup_errors_ref.current )
    }, [] )

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

    const lookup_word = useCallback( async ( word, { retry = true, signal } = {} ) => {

        const clean_word = clean_lookup_word( word )
        if( !clean_word || !api_key || !mounted_ref.current || signal?.aborted ) return

        const cache_key = word_cache_key( clean_word, source_language, target_language, lookup_context )

        if( word_translations_ref.current[cache_key] ) return

        if( loading_words_ref.current[cache_key] ) {
            const result = await lookup_tasks_ref.current[cache_key]?.promise
            if( result === LOOKUP_CANCELLED && !signal?.aborted ) {
                return lookup_word( word, { retry, signal } )
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

        const task = { cancelled: false, controller: null, promise: null }
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

                const { system, user } = build_word_lookup_prompt( clean_word, source_language, target_language, sentence_context )
                const { content } = await chat_completion( {
                    api_key,
                    model,
                    system_prompt: system,
                    user_message: user,
                    temperature: 0.1,
                    signal: controller.signal
                } )

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
                // Word lookups are opportunistic; the reading flow should never break on lookup failure.
                if( task.cancelled || error?.name === `AbortError` ) return LOOKUP_CANCELLED

                lookup_errors_ref.current = { ...lookup_errors_ref.current, [cache_key]: true }
                remember_lookup_key( cache_key )
            } finally {
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
        return task.promise

    }, [
        api_key,
        model,
        source_language,
        target_language,
        sentence_context,
        lookup_context,
        is_online,
        get_word_translation,
        cache_word_translation,
        remember_lookup_key,
        refresh_lookup_state,
        acquire_lookup_slot,
        release_lookup_slot
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

    useEffect( () => {
        if( !is_online ) cancel_lookups()
    }, [ is_online, cancel_lookups ] )

    useEffect( () => {
        mounted_ref.current = true

        return () => {
            mounted_ref.current = false
            cancel_lookups()
            word_abort_ref.current = {}
        }
    }, [ cancel_lookups ] )

    return { lookup_word, get_lookup_state, cancel_lookups }

}
