import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { log } from 'mentie'
import { chat_completion } from '../modules/open_router.js'
import {
    build_translation_system_prompt,
    build_translation_user_prompt,
    DEFAULT_LEVEL,
    LEVELS
} from '../modules/prompts.js'
import {
    save_translation,
    get_translation,
    get_translations,
    delete_translation,
    add_token_usage,
    get_token_usage
} from '../modules/cache.js'
import { use_settings_store } from '../stores/settings_store.js'

// Max parallel translation requests
const MAX_CONCURRENT = 5
const FAILED_TRANSLATION_RETRY_CHECK_MS = 5_000
const FAILED_TRANSLATION_RETRY_DELAYS_MS = [ 5_000, 15_000, 30_000, 60_000 ]
// A sentence that keeps failing stops retrying until the user re-translates or changes context
const FAILED_TRANSLATION_MAX_ATTEMPTS = 5
// Runaway guard only: reasoning models bill their thinking as completion tokens
const MAX_TOKENS_PADDING = 4_000
const sentence_max_tokens = text => text.length * 2 + MAX_TOKENS_PADDING

// Workers pull the next sentence as soon as they free up, so one slow request
// never holds back the other four.
const run_pool = ( pick_next, work, signal ) => Promise.all( Array.from( { length: MAX_CONCURRENT }, async () => {
    while( !signal.aborted ) {
        const item = pick_next()
        if( !item ) return
        await work( item )
    }
} ) )

const translation_cache_key = ( sentence_id, target_language, level ) =>
    `${ sentence_id }:${ target_language }:${ level }`

const is_abort_error = error => error?.name === `AbortError`

const remove_store_key = ( store, key ) => {
    if( !store[key] ) return store

    const next_store = { ...store }
    delete next_store[key]
    return next_store
}

/**
 * Detects fragments that do not contain translatable text.
 * @param {string} text
 * @returns {{ nonsense: boolean, reason: string }}
 */
export function is_nonsense( text ) {

    const nonsense_patterns = [
        '\\n', '\\t', '\\r',           // literal escape sequences
        /[\p{P}\p{S}\p{Cf}\s]/gu,      // punctuation, symbols, format chars, whitespace
    ]
    let nonsense = false
    let reason = ``

    // Remove non-meaning characters for analysis
    const cleaned = nonsense_patterns.reduce( ( text, pattern ) => {
        return text?.replaceAll( pattern, `` )
    }, text )

    // Check for length zero
    if( cleaned?.trim().length === 0 ) {
        nonsense = true
        reason = `Empty or whitespace-only sentence`
    }

    // Check for interpunction-only
    if( cleaned?.length && !/[\p{L}\p{N}]/u.test( cleaned ) ) {
        nonsense = true
        reason = `Interpunction-only sentence`
    }

    log.insane( `Sentence analysis:`, { original: text, cleaned, nonsense, reason } )
    return { nonsense, reason }
}

/**
 * Hook that manages translation of visible sentences with read-ahead
 * @param {Object} options
 * @param {Array} options.all_sentences - All sentences in current chapter [{ id, text, paragraph_context }]
 * @param {Array<string>} [options.eligible_sentence_ids] - Word-window admission, including enclosing sentences
 * @param {string} options.target_language
 * @param {string} options.level - Level code e.g. 'a1', 'b2'
 * @param {string} options.source_language
 * @param {string} [options.book_id] - For tracking per-book token usage
 * @param {boolean} [options.is_online] - Allows cached hydration while suppressing offline requests
 * @returns {{ translations, retranslate_sentence, is_translating, translation_progress, token_usage, record_token_usage }}
 */
export const use_translation = ( {
    all_sentences = [],
    eligible_sentence_ids,
    target_language,
    level,
    source_language,
    book_id,
    is_online = typeof navigator === `undefined` || navigator.onLine
} ) => {

    const requested_sentences = useMemo( () => {
        if( !eligible_sentence_ids ) return all_sentences
        const eligible = new Set( eligible_sentence_ids )
        return all_sentences.filter( sentence => eligible.has( sentence.id ) )
    }, [ all_sentences, eligible_sentence_ids ] )

    const requested_ref = useRef( requested_sentences )
    requested_ref.current = requested_sentences
    const schedule_translation_ref = useRef( null )

    const [ translations, set_translations ] = useState( {} )
    const [ is_translating, set_is_translating ] = useState( false )
    const [ token_usage, set_token_usage ] = useState( { prompt_tokens: 0, completion_tokens: 0 } )
    const token_usage_loaded = useRef( false )
    const retry_abort_ref = useRef( null )
    const retranslate_abort_ref = useRef( null )
    const retry_running_ref = useRef( false )
    const active_operations_ref = useRef( new Set() )
    const active_controllers_ref = useRef( new Set() )
    const translations_ref = useRef( {} )
    const failed_sentences_ref = useRef( {} )
    const translation_requests_ref = useRef( {} )
    const translation_versions_ref = useRef( {} )
    const mounted_ref = useRef( true )
    const api_key = use_settings_store( state => state.api_key )
    const model = use_settings_store( state => state.model )

    // Sentence translations and word lookups share the same per-book usage total.
    const record_token_usage = useCallback( ( { prompt_tokens = 0, completion_tokens = 0 } ) => {
        if( !prompt_tokens && !completion_tokens ) return
        set_token_usage( previous => ( {
            prompt_tokens: previous.prompt_tokens + prompt_tokens,
            completion_tokens: previous.completion_tokens + completion_tokens
        } ) )
        if( book_id ) add_token_usage( book_id, prompt_tokens, completion_tokens ).catch( () => {} )
    }, [ book_id ] )

    // Get level info
    const level_info = LEVELS.find( l => l.code === level ) || DEFAULT_LEVEL

    useEffect( () => {
        translations_ref.current = translations
    }, [ translations ] )

    const begin_translation = useCallback( () => {
        const operation = Symbol( `translation_operation` )
        active_operations_ref.current.add( operation )
        if( mounted_ref.current ) set_is_translating( true )
        return operation
    }, [] )

    const finish_translation = useCallback( ( operation ) => {
        active_operations_ref.current.delete( operation )
        if( mounted_ref.current ) set_is_translating( active_operations_ref.current.size > 0 )
    }, [] )

    const register_controller = useCallback( ( controller ) => {
        active_controllers_ref.current.add( controller )
        return () => active_controllers_ref.current.delete( controller )
    }, [] )

    const abort_active_translations = useCallback( () => {
        active_controllers_ref.current.forEach( controller => controller.abort() )
        active_controllers_ref.current.clear()
    }, [] )

    const forget_failed_sentence = useCallback( ( sentence_id ) => {
        if( !failed_sentences_ref.current[sentence_id] ) return

        const next_failed_sentences = { ...failed_sentences_ref.current }
        delete next_failed_sentences[sentence_id]
        failed_sentences_ref.current = next_failed_sentences
    }, [] )

    const remember_failed_sentence = useCallback( ( sentence, error ) => {
        const existing_failure = failed_sentences_ref.current[sentence.id]
        const attempts = ( existing_failure?.attempts || 0 ) + 1
        const backoff = FAILED_TRANSLATION_RETRY_DELAYS_MS[
            Math.min( attempts - 1, FAILED_TRANSLATION_RETRY_DELAYS_MS.length - 1 )
        ]
        // Honour the server's Retry-After; give up after the attempt cap
        const retry_delay = Math.max( backoff, error?.retry_after_ms || 0 )
        const retry_after = attempts >= FAILED_TRANSLATION_MAX_ATTEMPTS ? Infinity : Date.now() + retry_delay

        failed_sentences_ref.current = {
            ...failed_sentences_ref.current,
            [sentence.id]: { sentence, attempts, retry_after }
        }
    }, [] )

    const translate_sentence = useCallback( async ( sentence, signal, options = {} ) => {

        const {
            bypass_cache = false,
            cache_only = false,
            version = translation_versions_ref.current[sentence.id] || 0
        } = options
        const cache_key = translation_cache_key( sentence.id, target_language, level )

        if( signal.aborted ) return { id: sentence.id, skipped: true }

        // Check if is nonsense, return original if so (avoid unnecessary API calls and cache pollution)
        const { nonsense, reason } = is_nonsense( sentence.text )
        if( nonsense ) {
            log.debug( `Identified nonsense sentence, skipping translation and caching original text. Sentence ID: ${ sentence.id }, Reason: ${ reason }` )
            return { id: sentence.id, translated: sentence.text, from_cache: false }
        }

        // Check cache first unless the user explicitly asked for a fresh translation
        if( !bypass_cache ) {
            const cached = await get_translation( cache_key )
            if( signal.aborted ) return { id: sentence.id, skipped: true }
            if( cached ) return { id: sentence.id, translated: cached, from_cache: true }
        }

        if( options.is_eligible && !options.is_eligible( sentence.id ) ) return { id: sentence.id, skipped: true }
        if( cache_only ) return { id: sentence.id, skipped: true }

        const user_message = build_translation_user_prompt( sentence.text, sentence.context || sentence.text )

        const { content, usage } = await chat_completion( {
            api_key, model, system_prompt: options.system_prompt, user_message, signal,
            max_tokens: sentence_max_tokens( user_message )
        } )

        if( signal.aborted ) return { id: sentence.id, skipped: true }

        // Ignore stale requests that finished after a forced re-translation started.
        if( version !== ( translation_versions_ref.current[sentence.id] || 0 ) ) {
            return { id: sentence.id, skipped: true }
        }

        await save_translation( {
            key: cache_key,
            original: sentence.text,
            translated: content,
            language: target_language,
            level,
            created_at: new Date().toISOString()
        } )

        if( signal.aborted ) return { id: sentence.id, skipped: true }

        return { id: sentence.id, translated: content, from_cache: false, usage }

    }, [ api_key, model, target_language, level ] )

    // Results land one sentence at a time; React updates and usage are flushed once per task turn.
    const pending_translations_ref = useRef( {} )
    const pending_usage_ref = useRef( { prompt_tokens: 0, completion_tokens: 0 } )
    const flush_timer_ref = useRef( null )

    const flush_results = useCallback( () => {
        flush_timer_ref.current = null
        const new_translations = pending_translations_ref.current
        const usage = pending_usage_ref.current
        pending_translations_ref.current = {}
        pending_usage_ref.current = { prompt_tokens: 0, completion_tokens: 0 }

        if( Object.keys( new_translations ).length && mounted_ref.current ) {
            set_translations( prev => ( { ...prev, ...new_translations } ) )
        }
        record_token_usage( usage )
    }, [ record_token_usage ] )

    const queue_result = useCallback( ( { id, translated, usage } ) => {
        if( translated !== undefined ) pending_translations_ref.current[id] = translated
        if( usage ) {
            pending_usage_ref.current.prompt_tokens += usage.prompt_tokens || 0
            pending_usage_ref.current.completion_tokens += usage.completion_tokens || 0
        }
        flush_timer_ref.current ??= setTimeout( flush_results, 0 )
    }, [ flush_results ] )

    // Translate one sentence, deduplicated against identical in-flight requests
    const translate_one = useCallback( async ( sentence, signal, options = {} ) => {

        const cache_key = translation_cache_key( sentence.id, target_language, level )
        const version = translation_versions_ref.current[sentence.id] || 0
        const request_key = `${ cache_key }:${ version }`

        if( translation_requests_ref.current[request_key] && !options.bypass_cache ) return undefined
        translation_requests_ref.current = { ...translation_requests_ref.current, [request_key]: true }

        try {
            const result = await translate_sentence( sentence, signal, { ...options, version } )
            if( result.skipped ) return undefined

            translations_ref.current = { ...translations_ref.current, [result.id]: result.translated }
            forget_failed_sentence( result.id )
            queue_result( result )
            return result.translated
        } catch ( error ) {
            // A billed failure (empty answer) still counts towards usage
            if( error?.usage ) queue_result( { id: sentence.id, usage: error.usage } )
            if( signal.aborted || is_abort_error( error ) ) return undefined

            remember_failed_sentence( sentence, error )
            log.warn( `Translation failed:`, error?.message || error )
            log.debug( `Failed translation details:`, error )
            return undefined
        } finally {
            const next_requests = { ...translation_requests_ref.current }
            delete next_requests[request_key]
            translation_requests_ref.current = next_requests
        }

    }, [ target_language, level, translate_sentence, forget_failed_sentence, remember_failed_sentence, queue_result ] )

    // Run a worker pool over whatever pick_next hands out, sharing one system prompt
    const translate_pool = useCallback( async ( pick_next, signal, options = {} ) => {
        const system_prompt = options.cache_only
            ? undefined
            : build_translation_system_prompt(
                source_language, target_language, level_info.code, level_info.label
            )
        const translated = {}

        await run_pool( pick_next, async sentence => {
            const result = await translate_one( sentence, signal, { ...options, system_prompt } )
            if( result !== undefined ) translated[sentence.id] = result
        }, signal )

        return translated
    }, [ source_language, target_language, level_info, translate_one ] )

    // Translate a fixed list of sentences
    const translate_batch = useCallback( ( sentences_to_translate, signal, options = {} ) => {
        const queue = [ ...sentences_to_translate ]
        return translate_pool( () => queue.shift(), signal, options )
    }, [ translate_pool ] )

    // Read every cached sentence of the window in one transaction before any request goes out
    const hydrate_from_cache = useCallback( async ( sentences, signal ) => {
        const keys_by_id = new Map( sentences
            .filter( sentence => !translations_ref.current[sentence.id] )
            .map( sentence => [ sentence.id, translation_cache_key( sentence.id, target_language, level ) ] ) )
        if( !keys_by_id.size ) return

        const cached = await get_translations( [ ...keys_by_id.values() ] ).catch( () => ( {} ) )
        if( signal.aborted ) return

        const found = {}
        keys_by_id.forEach( ( key, id ) => {
            if( cached[key] ) found[id] = cached[key]
        } )
        if( !Object.keys( found ).length ) return

        translations_ref.current = { ...translations_ref.current, ...found }
        if( mounted_ref.current ) set_translations( prev => ( { ...prev, ...found } ) )
    }, [ target_language, level ] )

    // Follow the live admission window without restarting useful in-flight requests.
    useEffect( () => {
        if( !target_language || !level ) return

        let debounce_timer
        let running = false
        let rerun = false
        let stopped = false
        const controller = new AbortController()
        const is_eligible = id => requested_ref.current.some( sentence => sentence.id === id )

        const run = async () => {
            if( stopped || running ) return
            running = true
            const can_request = is_online && !!api_key
            const operation = can_request ? begin_translation() : null
            const unregister_controller = register_controller( controller )
            const attempted = new Set()

            try {
                await hydrate_from_cache( requested_ref.current, controller.signal )

                // Re-read on every pick: scrolling can remove or add queued work.
                const pick_next = () => {
                    const sentence = requested_ref.current.find( candidate =>
                        !translations_ref.current[candidate.id] && !attempted.has( candidate.id )
                            && !failed_sentences_ref.current[candidate.id]
                    )
                    if( sentence ) attempted.add( sentence.id )
                    return sentence
                }
                await translate_pool( pick_next, controller.signal, {
                    cache_only: !can_request,
                    is_eligible
                } )
            } catch ( error ) {
                if( !is_abort_error( error ) ) log.error( `Translation failed:`, error )
            } finally {
                running = false
                unregister_controller()
                if( operation ) finish_translation( operation )
                // Revisit cache reads skipped while their sentences were briefly outside the window.
                if( rerun && !stopped ) {
                    rerun = false
                    schedule()
                }
            }
        }
        const schedule = () => {
            if( running ) {
                rerun = true
                return
            }
            clearTimeout( debounce_timer )
            debounce_timer = setTimeout( run, 300 )
        }
        schedule_translation_ref.current = schedule
        schedule()

        return () => {
            stopped = true
            clearTimeout( debounce_timer )
            schedule_translation_ref.current = null
            controller.abort()
        }
    }, [ target_language, level, api_key, is_online, translate_pool, hydrate_from_cache, begin_translation, finish_translation, register_controller ] )

    useEffect( () => schedule_translation_ref.current?.(), [ requested_sentences ] )

    // Retry transient sentence failures without waiting for navigation or a settings change.
    useEffect( () => {

        if( !target_language || !level || !api_key || !is_online ) return

        const retry_failed_translations = async () => {
            if( retry_running_ref.current ) return
            if( !Object.keys( failed_sentences_ref.current ).length ) return

            const now = Date.now()
            const sentences_by_id = new Map( requested_ref.current.map( sentence => [ sentence.id, sentence ] ) )
            const sentences_to_retry = Object.values( failed_sentences_ref.current )
                .filter( failure => failure.retry_after <= now )
                .map( failure => sentences_by_id.get( failure.sentence.id ) )
                .filter( sentence => sentence && !translations_ref.current[sentence.id] )

            if( sentences_to_retry.length === 0 ) return

            const controller = new AbortController()
            retry_abort_ref.current = controller
            retry_running_ref.current = true
            const operation = begin_translation()
            const unregister_controller = register_controller( controller )

            try {
                await translate_batch( sentences_to_retry, controller.signal, {
                    is_eligible: id => requested_ref.current.some( sentence => sentence.id === id )
                } )
            } catch ( error ) {
                if( !is_abort_error( error ) ) log.warn( `Translation retry failed:`, error?.message || error )
            } finally {
                unregister_controller()
                retry_running_ref.current = false
                if( retry_abort_ref.current === controller ) retry_abort_ref.current = null
                finish_translation( operation )
            }
        }

        const retry_timer = setInterval( retry_failed_translations, FAILED_TRANSLATION_RETRY_CHECK_MS )

        return () => {
            clearInterval( retry_timer )
            if( retry_abort_ref.current ) retry_abort_ref.current.abort()
        }

    }, [
        target_language,
        level,
        api_key,
        is_online,
        translate_batch,
        begin_translation,
        finish_translation,
        register_controller
    ] )

    const retranslate_sentence = useCallback( async ( { sentence_id } ) => {

        const sentence = all_sentences.find( candidate => candidate.id === sentence_id )
        if( !sentence || !target_language || !level || !source_language || !api_key || !is_online ) return null

        const cache_key = translation_cache_key( sentence.id, target_language, level )
        const next_version = ( translation_versions_ref.current[sentence.id] || 0 ) + 1

        translation_versions_ref.current = {
            ...translation_versions_ref.current,
            [sentence.id]: next_version
        }
        translations_ref.current = remove_store_key( translations_ref.current, sentence.id )
        forget_failed_sentence( sentence.id )

        set_translations( prev => remove_store_key( prev, sentence.id ) )
        await delete_translation( cache_key ).catch( () => {} )

        retranslate_abort_ref.current?.abort()
        const controller = new AbortController()
        retranslate_abort_ref.current = controller
        const operation = begin_translation()
        const unregister_controller = register_controller( controller )

        try {
            const translated_by_id = await translate_batch( [ sentence ], controller.signal, { bypass_cache: true } )
            const translated = translated_by_id?.[sentence.id]

            if( !translated ) return null
            return {
                sentence_id: sentence.id,
                original: sentence.text,
                translated
            }
        } finally {
            unregister_controller()
            if( retranslate_abort_ref.current === controller ) retranslate_abort_ref.current = null
            finish_translation( operation )
        }

    }, [
        all_sentences,
        target_language,
        level,
        source_language,
        api_key,
        is_online,
        translate_batch,
        forget_failed_sentence,
        begin_translation,
        finish_translation,
        register_controller
    ] )

    // Clear translation state when the language context changes.
    useEffect( () => {
        set_translations( {} )
        translations_ref.current = {}
        failed_sentences_ref.current = {}
        translation_requests_ref.current = {}
        translation_versions_ref.current = {}
        abort_active_translations()
    }, [ source_language, target_language, level, abort_active_translations ] )

    useEffect( () => {
        if( !is_online ) abort_active_translations()
    }, [ is_online, abort_active_translations ] )

    useEffect( () => {
        mounted_ref.current = true

        return () => {
            mounted_ref.current = false
            abort_active_translations()
            active_operations_ref.current.clear()
            clearTimeout( flush_timer_ref.current )
            flush_timer_ref.current = null
        }
    }, [ abort_active_translations ] )

    // Load saved token usage for this book on mount
    // Uses functional update to merge with any in-flight additions (avoids race condition)
    useEffect( () => {
        if( !book_id ) return
        get_token_usage( book_id ).then( saved => {
            if( !saved ) return
            if( !token_usage_loaded.current ) {
                // First load — set the baseline from IDB
                token_usage_loaded.current = true
                set_token_usage( prev => ( {
                    prompt_tokens: saved.prompt_tokens + prev.prompt_tokens,
                    completion_tokens: saved.completion_tokens + prev.completion_tokens
                } ) )
            }
        } ).catch( () => {} )
    }, [ book_id ] )

    const translated_sentence_count = all_sentences.filter( sentence => translations[sentence.id] ).length
    const translation_progress = all_sentences.length > 0
        ? Math.round( translated_sentence_count / all_sentences.length * 100 )
        : 0

    return {
        translations,
        retranslate_sentence,
        is_translating,
        translation_progress,
        token_usage,
        record_token_usage
    }

}
