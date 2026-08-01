const WORD_WITH_LETTERS_RE = /\p{L}/u
const FALLBACK_WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’\-\u2010\u2011][\p{L}\p{M}\p{N}]+)*/gu
const WORD_CONNECTOR_RE = /^[\u2010\u2011-]$/u

const is_translation_word = segment =>
    !!segment?.isWordLike && WORD_WITH_LETTERS_RE.test( segment.segment )

const combine_hyphenated_words = ( raw_segments ) => {

    const combined_segments = []
    let segment_index = 0

    while( segment_index < raw_segments.length ) {
        const segment = raw_segments[segment_index]

        if( !is_translation_word( segment ) ) {
            combined_segments.push( {
                text: segment.segment,
                is_word: false,
                word_index: null
            } )
            segment_index += 1
            continue
        }

        let text = segment.segment
        let next_index = segment_index + 1

        // Keep compounds such as "state-of-the-art" as one tap target while
        // leaving dashes used as punctuation outside the word.
        while(
            WORD_CONNECTOR_RE.test( raw_segments[next_index]?.segment || `` )
            && is_translation_word( raw_segments[next_index + 1] )
        ) {
            text += raw_segments[next_index].segment + raw_segments[next_index + 1].segment
            next_index += 2
        }

        combined_segments.push( { text, is_word: true, word_index: null } )
        segment_index = next_index
    }

    return combined_segments

}

const segment_with_unicode_fallback = ( text ) => {

    const segments = []
    let cursor = 0

    for( const match of text.matchAll( FALLBACK_WORD_RE ) ) {
        const start = match.index || 0
        const [ word ] = match

        if( start > cursor ) {
            segments.push( {
                text: text.slice( cursor, start ),
                is_word: false,
                word_index: null
            } )
        }

        segments.push( {
            text: word,
            is_word: WORD_WITH_LETTERS_RE.test( word ),
            word_index: null
        } )
        cursor = start + word.length
    }

    if( cursor < text.length ) {
        segments.push( {
            text: text.slice( cursor ),
            is_word: false,
            word_index: null
        } )
    }

    return segments

}

const index_translation_words = ( segments ) => {

    let word_index = 0

    return segments.map( segment => {
        if( !segment.is_word ) return segment

        const indexed_segment = { ...segment, word_index }
        word_index += 1
        return indexed_segment
    } )

}

/**
 * Splits translated text into exact display segments with stable tap-target indexes.
 * Locale-aware segmentation handles languages without spaces; a Unicode fallback
 * keeps the same public shape on older browsers.
 * @param {string} text - Adapted target-language fragment
 * @returns {Array<{ text: string, is_word: boolean, word_index: number|null }>}
 */
export const segment_translation_text = ( text ) => {

    const visible_text = String( text || `` )
    if( !visible_text ) return []

    if( typeof Intl !== `undefined` && Intl.Segmenter ) {
        try {
            const segmenter = new Intl.Segmenter( undefined, { granularity: `word` } )
            const raw_segments = Array.from( segmenter.segment( visible_text ) )

            return index_translation_words( combine_hyphenated_words( raw_segments ) )
        } catch {
            // Some older WebViews expose Segmenter but reject word granularity.
        }
    }

    return index_translation_words( segment_with_unicode_fallback( visible_text ) )

}
