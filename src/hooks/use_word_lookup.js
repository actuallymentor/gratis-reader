import { useState, useRef, useCallback, useEffect } from 'react'
import { chat_completion } from '../modules/open_router.js'
import { build_word_lookup_prompt } from '../modules/prompts.js'
import { use_settings_store } from '../stores/settings_store.js'
import { use_cache } from './use_cache.js'

const WORD_PUNCTUATION_RE = /[.,!?;:'"()[\]{}]/g
const WORD_WITH_LETTERS_RE = /\p{L}/u
const WORD_LOOKUP_MEMORY_LIMIT = 250

/**
 * Normalizes a visible word before dictionary lookup.
 * @param {string} word
 * @returns {string}
 */
export const clean_lookup_word = ( word ) => {
    const clean_word = String( word || `` ).replace( WORD_PUNCTUATION_RE, `` ).trim()
    return WORD_WITH_LETTERS_RE.test( clean_word ) ? clean_word : ``
}

/**
 * Builds the stable lookup cache key used by word tooltips.
 * @param {string} word
 * @param {string} source_language
 * @param {string} target_language
 * @returns {string}
 */
export const word_cache_key = ( word, source_language, target_language ) =>
    `${ clean_lookup_word( word ).toLowerCase() }:${ source_language }:${ target_language }`

/**
 * Looks up target-language words and caches their source-language equivalents.
 * @param {Object} options
 * @param {string} options.source_language
 * @param {string} options.target_language
 * @param {string} options.sentence_context
 * @returns {Object}
 */
export const use_word_lookup = ( { source_language, target_language, sentence_context } ) => {

    const [ , set_lookup_version ] = useState( 0 )
    const word_translations_ref = useRef( {} )
    const loading_words_ref = useRef( {} )
    const lookup_errors_ref = useRef( {} )
    const word_abort_ref = useRef( {} )
    const lookup_keys_ref = useRef( [] )
    const mounted_ref = useRef( true )
    const api_key = use_settings_store( state => state.api_key )
    const model = use_settings_store( state => state.model )
    const { get_word_translation, cache_word_translation } = use_cache()

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

    const lookup_word = useCallback( async ( word ) => {

        const clean_word = clean_lookup_word( word )
        if( !clean_word || !api_key ) return

        const cache_key = word_cache_key( clean_word, source_language, target_language )

        if( word_translations_ref.current[cache_key] || loading_words_ref.current[cache_key] ) return

        loading_words_ref.current = { ...loading_words_ref.current, [cache_key]: true }
        lookup_errors_ref.current = { ...lookup_errors_ref.current, [cache_key]: false }
        refresh_lookup_state()

        const controller = new AbortController()
        word_abort_ref.current = { ...word_abort_ref.current, [cache_key]: controller }
        let refresh_in_finally = true

        const clear_loading_word = () => {
            const next_loading_words = { ...loading_words_ref.current }
            delete next_loading_words[cache_key]
            loading_words_ref.current = next_loading_words
        }

        try {
            const cached = await get_word_translation( clean_word, source_language, target_language )
            if( controller.signal.aborted ) return

            if( cached ) {
                word_translations_ref.current = { ...word_translations_ref.current, [cache_key]: cached }
                remember_lookup_key( cache_key )
                return
            }

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
                await cache_word_translation( clean_word, source_language, target_language, content )
            } catch {
                // Cache writes should not invalidate a successful lookup.
            }
        } catch ( error ) {
            // Word lookups are opportunistic; the reading flow should never break on lookup failure.
            if( !controller.signal.aborted && error?.name !== `AbortError` ) {
                lookup_errors_ref.current = { ...lookup_errors_ref.current, [cache_key]: true }
                remember_lookup_key( cache_key )
            }
        } finally {
            const remaining_controllers = { ...word_abort_ref.current }
            delete remaining_controllers[cache_key]
            word_abort_ref.current = remaining_controllers

            if( refresh_in_finally ) {
                clear_loading_word()
                refresh_lookup_state()
            }
        }

    }, [
        api_key,
        model,
        source_language,
        target_language,
        sentence_context,
        get_word_translation,
        cache_word_translation,
        remember_lookup_key,
        refresh_lookup_state
    ] )

    const get_lookup_state = useCallback( ( word ) => {
        const cache_key = word_cache_key( word, source_language, target_language )

        return {
            cache_key,
            content: word_translations_ref.current[cache_key],
            loading: !!loading_words_ref.current[cache_key],
            error: !!lookup_errors_ref.current[cache_key],
            can_lookup: !!api_key
        }
    }, [ source_language, target_language, api_key ] )

    useEffect( () => {
        mounted_ref.current = true

        return () => {
            mounted_ref.current = false
            Object.values( word_abort_ref.current ).forEach( controller => controller.abort() )
            word_abort_ref.current = {}
        }
    }, [] )

    return { lookup_word, get_lookup_state }

}
