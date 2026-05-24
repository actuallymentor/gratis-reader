import { useState, useRef, useCallback, useEffect } from 'react'
import { chat_completion } from '../modules/open_router.js'
import { build_word_lookup_prompt } from '../modules/prompts.js'
import { use_settings_store } from '../stores/settings_store.js'
import { use_cache } from './use_cache.js'

const WORD_PUNCTUATION_RE = /[.,!?;:'"()[\]{}]/g

/**
 * Normalizes a visible word before dictionary lookup.
 * @param {string} word
 * @returns {string}
 */
export const clean_lookup_word = ( word ) => word.replace( WORD_PUNCTUATION_RE, `` ).trim()

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

    const [ word_translations, set_word_translations ] = useState( {} )
    const [ loading_words, set_loading_words ] = useState( {} )
    const word_abort_ref = useRef( null )
    const api_key = use_settings_store( state => state.api_key )
    const model = use_settings_store( state => state.model )
    const { get_word_translation, cache_word_translation } = use_cache()

    const lookup_word = useCallback( async ( word ) => {

        if( !word.trim() || !api_key ) return

        const clean_word = clean_lookup_word( word )
        if( !clean_word ) return

        const cache_key = word_cache_key( clean_word, source_language, target_language )

        if( word_translations[cache_key] || loading_words[cache_key] ) return

        const cached = await get_word_translation( clean_word, source_language, target_language )
        if( cached ) {
            set_word_translations( prev => ( { ...prev, [cache_key]: cached } ) )
            return
        }

        if( word_abort_ref.current ) word_abort_ref.current.abort()
        const controller = new AbortController()
        word_abort_ref.current = controller

        set_loading_words( prev => ( { ...prev, [cache_key]: true } ) )

        try {
            const { system, user } = build_word_lookup_prompt( clean_word, source_language, target_language, sentence_context )
            const { content } = await chat_completion( {
                api_key,
                model,
                system_prompt: system,
                user_message: user,
                temperature: 0.1,
                signal: controller.signal
            } )

            set_word_translations( prev => ( { ...prev, [cache_key]: content } ) )
            await cache_word_translation( clean_word, source_language, target_language, content )
        } catch {
            // Word lookups are opportunistic; the reading flow should never break on lookup failure.
        } finally {
            set_loading_words( prev => ( { ...prev, [cache_key]: false } ) )
        }

    }, [
        api_key,
        model,
        source_language,
        target_language,
        sentence_context,
        word_translations,
        loading_words,
        get_word_translation,
        cache_word_translation
    ] )

    const get_lookup_state = useCallback( ( word ) => {
        const cache_key = word_cache_key( word, source_language, target_language )

        return {
            cache_key,
            content: word_translations[cache_key],
            loading: !!loading_words[cache_key]
        }
    }, [ source_language, target_language, word_translations, loading_words ] )

    useEffect( () => {
        return () => {
            if( word_abort_ref.current ) word_abort_ref.current.abort()
        }
    }, [] )

    return { lookup_word, get_lookup_state }

}
