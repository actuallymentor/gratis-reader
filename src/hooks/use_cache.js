import { useRef, useCallback } from 'react'
import { get_translation, get_translations, save_translation } from '../modules/cache.js'
import { log } from 'mentie'

/**
 * Hook for word-level translation cache operations
 * @returns {{ get_word_translation, get_word_translations, cache_word_translation }}
 */
export const use_cache = () => {

    // Use ref to avoid re-creating callbacks when cache updates
    const word_cache_ref = useRef( {} )

    const get_word_translation = useCallback( async ( word, source_lang, target_lang, lookup_context = `` ) => {

        const context_suffix = lookup_context ? `:${ encodeURIComponent( lookup_context ) }` : ``
        const key = `word:${ word.toLowerCase() }:${ source_lang }:${ target_lang }${ context_suffix }`

        // Check in-memory cache first
        if( word_cache_ref.current[key] ) return word_cache_ref.current[key]

        // Check IndexedDB
        const cached = await get_translation( key )
        if( cached ) {
            word_cache_ref.current[key] = cached
            return cached
        }

        return null

    }, [] )

    // Resolve many words at once: memory first, then one IndexedDB read for the rest
    const get_word_translations = useCallback( async ( words, source_lang, target_lang, lookup_context = `` ) => {

        const context_suffix = lookup_context ? `:${ encodeURIComponent( lookup_context ) }` : ``
        const keys_by_word = new Map( words.map( word => [ word, `word:${ word.toLowerCase() }:${ source_lang }:${ target_lang }${ context_suffix }` ] ) )
        // Null prototype: a word like "constructor" must not resolve to Object.prototype
        const found = Object.create( null )
        const missing = []

        keys_by_word.forEach( ( key, word ) => {
            if( word_cache_ref.current[key] ) found[word] = word_cache_ref.current[key]
            else missing.push( key )
        } )

        const stored = missing.length ? await get_translations( missing ).catch( () => ( {} ) ) : {}
        keys_by_word.forEach( ( key, word ) => {
            if( !stored[key] ) return
            word_cache_ref.current[key] = stored[key]
            found[word] = stored[key]
        } )

        return found

    }, [] )

    const cache_word_translation = useCallback( async (
        word,
        source_lang,
        target_lang,
        translation,
        lookup_context = ``
    ) => {

        const context_suffix = lookup_context ? `:${ encodeURIComponent( lookup_context ) }` : ``
        const key = `word:${ word.toLowerCase() }:${ source_lang }:${ target_lang }${ context_suffix }`

        // Save to IndexedDB
        await save_translation( {
            key,
            original: word,
            translated: translation,
            language: target_lang,
            level: `word`,
            created_at: new Date().toISOString()
        } )

        // Update in-memory cache
        word_cache_ref.current[key] = translation

        log.debug( `Cached word translation: ${ word } → ${ translation }` )

    }, [] )

    return { get_word_translation, get_word_translations, cache_word_translation }

}
