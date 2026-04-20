import { useRef, useCallback } from 'react'
import { get_translation, save_translation } from '../modules/cache.js'
import { log } from 'mentie'

/**
 * Hook for word-level translation cache operations
 * @returns {{ get_word_translation, cache_word_translation }}
 */
export const use_cache = () => {

    // Use ref to avoid re-creating callbacks when cache updates
    const word_cache_ref = useRef( {} )

    const get_word_translation = useCallback( async ( word, source_lang, target_lang ) => {

        const key = `word:${ word.toLowerCase() }:${ source_lang }:${ target_lang }`

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

    const cache_word_translation = useCallback( async ( word, source_lang, target_lang, translation ) => {

        const key = `word:${ word.toLowerCase() }:${ source_lang }:${ target_lang }`

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

    return { get_word_translation, cache_word_translation }

}
