import { useState, useEffect, useRef, useCallback } from 'react'
import { log } from 'mentie'
import { chat_completion } from '../modules/open_router.js'
import {
    build_back_translation_prompt,
    build_translation_system_prompt,
    build_translation_user_prompt,
    DEFAULT_LEVEL,
    LEVELS
} from '../modules/prompts.js'
import {
    save_translation,
    get_translation,
    save_sentence_meaning,
    get_sentence_meaning,
    add_token_usage,
    get_token_usage
} from '../modules/cache.js'
import { use_settings_store } from '../stores/settings_store.js'

// Max parallel translation requests
const MAX_CONCURRENT = 5

const sentence_meaning_cache_key = ( sentence_id, source_language, target_language, level ) =>
    `${ sentence_id }:${ target_language }:${ source_language }:${ level }`

export function is_nonsense( text ) {

    const nonsense_patterns = [
        '\\n', '\\tr', '\\r',          // literal escape sequences
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
    if( cleaned?.length && !/[a-zA-Z0-9]/.test( cleaned ) ) {
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
 * @returns {{ translations, meanings, meaning_errors, request_sentence_meaning, is_translating, translation_progress, token_usage }}
 */
export const use_translation = ( { all_sentences = [], target_language, level, source_language, book_id } ) => {

    const [ translations, set_translations ] = useState( {} )
    const [ meanings, set_meanings ] = useState( {} )
    const [ meaning_loading, set_meaning_loading ] = useState( {} )
    const [ meaning_errors, set_meaning_errors ] = useState( {} )
    const [ is_translating, set_is_translating ] = useState( false )
    const [ token_usage, set_token_usage ] = useState( { prompt_tokens: 0, completion_tokens: 0 } )
    const token_usage_loaded = useRef( false )
    const abort_ref = useRef( null )
    const meaning_requests_ref = useRef( {} )
    const mounted_ref = useRef( true )
    const api_key = use_settings_store( state => state.api_key )
    const model = use_settings_store( state => state.model )

    // Get level info
    const level_info = LEVELS.find( l => l.code === level ) || DEFAULT_LEVEL

    const request_sentence_meaning = useCallback( async ( { sentence_id, translated } ) => {

        if( !sentence_id || !translated || !source_language || !target_language || !level ) return

        if( meanings[sentence_id] || meaning_loading[sentence_id] || meaning_requests_ref.current[sentence_id] ) return

        if( !api_key ) {
            set_meaning_errors( prev => ( { ...prev, [sentence_id]: true } ) )
            return
        }

        const cache_key = sentence_meaning_cache_key( sentence_id, source_language, target_language, level )
        const controller = new AbortController()

        meaning_requests_ref.current = { ...meaning_requests_ref.current, [sentence_id]: controller }
        set_meaning_loading( prev => ( { ...prev, [sentence_id]: true } ) )
        set_meaning_errors( prev => {
            if( !prev[sentence_id] ) return prev

            const next_errors = { ...prev }
            delete next_errors[sentence_id]
            return next_errors
        } )

        try {
            const cached = await get_sentence_meaning( cache_key )
            if( controller.signal.aborted ) return

            if( cached ) {
                if( mounted_ref.current ) set_meanings( prev => ( { ...prev, [sentence_id]: cached } ) )
                return
            }

            const { system, user } = build_back_translation_prompt( source_language, target_language, translated )

            const { content, usage } = await chat_completion( {
                api_key,
                model,
                system_prompt: system,
                user_message: user,
                temperature: 0.1,
                signal: controller.signal
            } )

            if( controller.signal.aborted ) return

            if( mounted_ref.current ) set_meanings( prev => ( { ...prev, [sentence_id]: content } ) )

            const prompt_tokens = usage?.prompt_tokens || 0
            const completion_tokens = usage?.completion_tokens || 0

            if( prompt_tokens > 0 || completion_tokens > 0 ) {
                set_token_usage( prev => ( {
                    prompt_tokens: prev.prompt_tokens + prompt_tokens,
                    completion_tokens: prev.completion_tokens + completion_tokens
                } ) )
                if( book_id ) {
                    add_token_usage( book_id, prompt_tokens, completion_tokens ).catch( () => {} )
                }
            }

            try {
                await save_sentence_meaning( {
                    key: cache_key,
                    translated,
                    meaning: content,
                    source_language,
                    target_language,
                    level,
                    created_at: new Date().toISOString()
                } )
            } catch {
                // Meaning cache writes are best-effort; the inline result is already available.
            }
        } catch ( error ) {
            if( controller.signal.aborted || error?.name === `AbortError` ) return

            log.warn( `Sentence meaning failed:`, error?.message || error )
            if( mounted_ref.current ) set_meaning_errors( prev => ( { ...prev, [sentence_id]: true } ) )
        } finally {
            const remaining_requests = { ...meaning_requests_ref.current }
            delete remaining_requests[sentence_id]
            meaning_requests_ref.current = remaining_requests

            if( mounted_ref.current ) {
                set_meaning_loading( prev => {
                    if( !prev[sentence_id] ) return prev

                    const next_loading = { ...prev }
                    delete next_loading[sentence_id]
                    return next_loading
                } )
            }
        }

    }, [
        meanings,
        meaning_loading,
        source_language,
        target_language,
        level,
        api_key,
        model,
        book_id
    ] )

    // Translate a batch of sentences
    const translate_batch = useCallback( async ( sentences_to_translate, signal ) => {

        const system_prompt = build_translation_system_prompt(
            source_language, target_language, level_info.code, level_info.label
        )

        // Process in chunks of MAX_CONCURRENT
        for( let i = 0; i < sentences_to_translate.length; i += MAX_CONCURRENT ) {


            // Check for cancellation before starting each chunk
            if( signal.aborted ) return

            const chunk = sentences_to_translate.slice( i, i + MAX_CONCURRENT )

            const results = await Promise.allSettled(
                chunk.map( async ( sentence ) => {

                    const cache_key = `${ sentence.id }:${ target_language }:${ level }`

                    // Check if is nonsense, return original if so (avoid unnecessary API calls and cache pollution)
                    const { nonsense, reason } = is_nonsense( sentence.text )
                    if( nonsense ) {
                        log.debug( `Identified nonsense sentence, skipping translation and caching original text. Sentence ID: ${ sentence.id }, Reason: ${ reason }` )
                        return { id: sentence.id, translated: sentence.text, from_cache: false }
                    }

                    // Check cache first
                    const cached = await get_translation( cache_key )
                    if( cached ) return { id: sentence.id, translated: cached, from_cache: true }

                    // Translate via API
                    const user_message = build_translation_user_prompt( sentence.text, sentence.context || sentence.text )

                    const { content, usage } = await chat_completion( {
                        api_key, model, system_prompt, user_message, signal
                    } )

                    // Cache the result
                    await save_translation( {
                        key: cache_key,
                        original: sentence.text,
                        translated: content,
                        language: target_language,
                        level,
                        created_at: new Date().toISOString()
                    } )

                    return { id: sentence.id, translated: content, from_cache: false, usage }

                } )
            )

            // Update translations state with successful results, log failures
            // Accumulate token usage from API calls in this chunk
            const new_translations = {}
            let chunk_prompt = 0
            let chunk_completion = 0

            for( const result of results ) {
                if( result.status === `fulfilled` ) {
                    new_translations[result.value.id] = result.value.translated
                    if( result.value.usage ) {
                        chunk_prompt += result.value.usage.prompt_tokens || 0
                        chunk_completion += result.value.usage.completion_tokens || 0
                    }
                } else {
                    log.warn( `Translation failed:`, result.reason?.message || result.reason )
                    log.debug( `Failed translation details:`, result )
                }
            }

            if( Object.keys( new_translations ).length > 0 ) {
                set_translations( prev => ( { ...prev, ...new_translations } ) )
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

    }, [ api_key, model, source_language, target_language, level, level_info, book_id ] )

    // Trigger translation when visible sentences or settings change (debounced)
    useEffect( () => {

        if( !all_sentences.length || !target_language || !level || !api_key ) return

        // Debounce to prevent rapid-fire requests during fast navigation
        const debounce_timer = setTimeout( () => {

            // Cancel previous translation batch
            if( abort_ref.current ) abort_ref.current.abort()
            const controller = new AbortController()
            abort_ref.current = controller

            const run = async () => {

                set_is_translating( true )

                try {

                    // Determine which sentences need translation
                    // Translate all untranslated sentences in the chapter
                    // (cached translations are served instantly, only uncached hit the API)
                    const to_translate = all_sentences.filter(
                        sentence => !translations[sentence.id]
                    )

                    if( to_translate.length > 0 ) {
                        await translate_batch( to_translate, controller.signal )
                    }

                } catch ( error ) {
                    if( error.name !== `AbortError` ) {
                        log.error( `Translation failed:`, error )
                    }
                } finally {
                    set_is_translating( false )
                }

            }

            run()

        }, 300 )

        return () => {
            clearTimeout( debounce_timer )
            if( abort_ref.current ) abort_ref.current.abort()
        }

    }, [ all_sentences, target_language, level, api_key, translate_batch ] )

    // Clear translations and meanings when the language context changes
    useEffect( () => {
        set_translations( {} )
        set_meanings( {} )
        set_meaning_loading( {} )
        set_meaning_errors( {} )
        Object.values( meaning_requests_ref.current ).forEach( controller => controller.abort() )
        meaning_requests_ref.current = {}
    }, [ source_language, target_language, level ] )

    useEffect( () => {
        mounted_ref.current = true

        return () => {
            mounted_ref.current = false
            Object.values( meaning_requests_ref.current ).forEach( controller => controller.abort() )
            meaning_requests_ref.current = {}
        }
    }, [] )

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

    const translation_progress = all_sentences.length > 0
        ? Math.round(  Object.keys( translations ).length / all_sentences.length  * 100 )
        : 0

    return {
        translations,
        meanings,
        meaning_errors,
        request_sentence_meaning,
        is_translating,
        translation_progress,
        token_usage
    }

}
