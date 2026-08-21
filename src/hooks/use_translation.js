import { useState, useEffect, useRef, useCallback } from 'react'
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
    delete_translation,
    add_token_usage,
    get_token_usage
} from '../modules/cache.js'
import { use_settings_store } from '../stores/settings_store.js'

// Max parallel translation requests
const MAX_CONCURRENT = 5
const FAILED_TRANSLATION_RETRY_CHECK_MS = 5_000
const FAILED_TRANSLATION_RETRY_DELAYS_MS = [ 5_000, 15_000, 30_000, 60_000 ]

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
 * @param {string} options.target_language
 * @param {string} options.level - Level code e.g. 'a1', 'b2'
 * @param {string} options.source_language
 * @param {string} [options.book_id] - For tracking per-book token usage
 * @param {boolean} [options.is_online] - Allows cached hydration while suppressing offline requests
 * @returns {{ translations, retranslate_sentence, is_translating, translation_progress, token_usage }}
 */
export const use_translation = ( {
    all_sentences = [],
    target_language,
    level,
    source_language,
    book_id,
    is_online = typeof navigator === `undefined` || navigator.onLine
} ) => {

    const [ translations, set_translations ] = useState( {} )
    const [ is_translating, set_is_translating ] = useState( false )
    const [ token_usage, set_token_usage ] = useState( { prompt_tokens: 0, completion_tokens: 0 } )
    const token_usage_loaded = useRef( false )
    const abort_ref = useRef( null )
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

    const remember_failed_sentence = useCallback( ( sentence ) => {
        const existing_failure = failed_sentences_ref.current[sentence.id]
        const attempts = ( existing_failure?.attempts || 0 ) + 1
        const retry_delay = FAILED_TRANSLATION_RETRY_DELAYS_MS[
            Math.min( attempts - 1, FAILED_TRANSLATION_RETRY_DELAYS_MS.length - 1 )
        ]

        failed_sentences_ref.current = {
            ...failed_sentences_ref.current,
            [sentence.id]: {
                sentence,
                attempts,
                retry_after: Date.now() + retry_delay
            }
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

        if( cache_only ) return { id: sentence.id, skipped: true }

        const user_message = build_translation_user_prompt( sentence.text, sentence.context || sentence.text )

        const { content, usage } = await chat_completion( {
            api_key, model, system_prompt: options.system_prompt, user_message, signal
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

    // Translate a batch of sentences
    const translate_batch = useCallback( async ( sentences_to_translate, signal, options = {} ) => {

        const system_prompt = options.cache_only
            ? undefined
            : build_translation_system_prompt(
                source_language, target_language, level_info.code, level_info.label
            )
        const batch_translations = {}

        // Process in chunks of MAX_CONCURRENT
        for( let i = 0; i < sentences_to_translate.length; i += MAX_CONCURRENT ) {


            // Check for cancellation before starting each chunk
            if( signal.aborted ) return

            const chunk = sentences_to_translate.slice( i, i + MAX_CONCURRENT )

            const results = await Promise.allSettled(
                chunk.map( async ( sentence ) => {

                    const cache_key = translation_cache_key( sentence.id, target_language, level )
                    const version = translation_versions_ref.current[sentence.id] || 0
                    const request_key = `${ cache_key }:${ version }`

                    if( translation_requests_ref.current[request_key] && !options.bypass_cache ) {
                        return { id: sentence.id, skipped: true }
                    }

                    translation_requests_ref.current = {
                        ...translation_requests_ref.current,
                        [request_key]: true
                    }

                    try {
                        return await translate_sentence( sentence, signal, {
                            ...options,
                            system_prompt,
                            version
                        } )
                    } finally {
                        const next_requests = { ...translation_requests_ref.current }
                        delete next_requests[request_key]
                        translation_requests_ref.current = next_requests
                    }

                } )
            )

            // Update translations state with successful results, log failures
            // Accumulate token usage from API calls in this chunk
            const new_translations = {}
            let chunk_prompt = 0
            let chunk_completion = 0

            results.forEach( ( result, index ) => {
                const sentence = chunk[index]

                if( result.status === `fulfilled` ) {
                    if( result.value.skipped ) return

                    new_translations[result.value.id] = result.value.translated
                    forget_failed_sentence( result.value.id )

                    if( result.value.usage ) {
                        chunk_prompt += result.value.usage.prompt_tokens || 0
                        chunk_completion += result.value.usage.completion_tokens || 0
                    }
                } else {
                    if( signal.aborted || is_abort_error( result.reason ) ) return

                    remember_failed_sentence( sentence )
                    log.warn( `Translation failed:`, result.reason?.message || result.reason )
                    log.debug( `Failed translation details:`, result )
                }
            } )

            if( Object.keys( new_translations ).length > 0 ) {
                set_translations( prev => ( { ...prev, ...new_translations } ) )
                Object.assign( batch_translations, new_translations )
            }

            // Persist token usage for this chunk
            if( chunk_prompt > 0 || chunk_completion > 0 ) {
                set_token_usage( prev => ( {
                    prompt_tokens: prev.prompt_tokens + chunk_prompt,
                    completion_tokens: prev.completion_tokens + chunk_completion
                } ) )
                if( book_id ) {
                    add_token_usage( book_id, chunk_prompt, chunk_completion ).catch( () => {} )
                }
            }
        }

        return batch_translations

    }, [
        source_language,
        target_language,
        level,
        level_info,
        book_id,
        translate_sentence,
        forget_failed_sentence,
        remember_failed_sentence
    ] )

    // Trigger translation when visible sentences or settings change (debounced)
    useEffect( () => {

        if( !all_sentences.length || !target_language || !level ) return

        // Debounce to prevent rapid-fire requests during fast navigation
        const debounce_timer = setTimeout( () => {

            // Cancel previous translation batch
            if( abort_ref.current ) abort_ref.current.abort()
            const controller = new AbortController()
            abort_ref.current = controller

            const run = async () => {
                const to_translate = all_sentences.filter(
                    sentence => !translations_ref.current[sentence.id]
                )
                if( to_translate.length === 0 ) return

                const can_request = is_online && !!api_key
                const operation = can_request ? begin_translation() : null
                const unregister_controller = register_controller( controller )

                try {
                    // Always hydrate IndexedDB. Only cache misses reach the network while online.
                    await translate_batch( to_translate, controller.signal, {
                        cache_only: !can_request
                    } )
                } catch ( error ) {
                    if( !is_abort_error( error ) ) {
                        log.error( `Translation failed:`, error )
                    }
                } finally {
                    unregister_controller()
                    if( abort_ref.current === controller ) abort_ref.current = null
                    if( operation ) finish_translation( operation )
                }

            }

            run()

        }, 300 )

        return () => {
            clearTimeout( debounce_timer )
            if( abort_ref.current ) abort_ref.current.abort()
        }

    }, [
        all_sentences,
        target_language,
        level,
        api_key,
        is_online,
        translate_batch,
        begin_translation,
        finish_translation,
        register_controller
    ] )

    // Retry transient sentence failures without waiting for navigation or a settings change.
    useEffect( () => {

        if( !all_sentences.length || !target_language || !level || !api_key || !is_online ) return

        const retry_failed_translations = async () => {
            if( retry_running_ref.current ) return

            const now = Date.now()
            const sentences_by_id = new Map( all_sentences.map( sentence => [ sentence.id, sentence ] ) )
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
                await translate_batch( sentences_to_retry, controller.signal )
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
        all_sentences,
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
        token_usage
    }

}
