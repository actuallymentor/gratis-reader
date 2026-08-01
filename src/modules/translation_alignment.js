const WORD_WITH_LETTERS_RE = /\p{L}/u
const FALLBACK_WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’\-\u2010\u2011][\p{L}\p{M}\p{N}]+)*/gu
const WORD_CONNECTOR_RE = /^[\u2010\u2011-]$/u

/** Version attached to cached simplified meanings with validated alignment data. */
export const MEANING_ALIGNMENT_VERSION = 1

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

const strip_json_fence = ( content ) => {

    const trimmed_content = String( content || `` ).trim()
    const fenced_match = trimmed_content.match( /^```(?:json)?\s*([\s\S]*?)\s*```$/i )
    return fenced_match ? fenced_match[1].trim() : trimmed_content

}

const parse_json_object = ( content ) => {

    try {
        return JSON.parse( content )
    } catch {
        const object_start = content.indexOf( `{` )
        const object_end = content.lastIndexOf( `}` )
        if( object_start < 0 || object_end <= object_start ) return null

        try {
            return JSON.parse( content.slice( object_start, object_end + 1 ) )
        } catch {
            return null
        }
    }

}

const trim_alignment_boundaries = ( segments ) => {

    const trimmed_segments = segments.map( segment => ( { ...segment } ) )
    if( trimmed_segments.length === 0 ) return trimmed_segments

    trimmed_segments[0].text = trimmed_segments[0].text.replace( /^\s+/, `` )
    const { length } = trimmed_segments
    trimmed_segments[length - 1].text = trimmed_segments[length - 1].text.replace( /\s+$/, `` )

    return trimmed_segments.filter( segment => segment.text )

}

const validate_alignment_segments = ( segments, target_word_count ) => {

    if( !Array.isArray( segments ) || segments.length === 0 || target_word_count === 0 ) return null

    const used_target_indexes = new Set()
    const validated_segments = []

    for( const segment of segments ) {
        if( !segment || typeof segment.text !== `string` || !Array.isArray( segment.target_token_indexes ) ) {
            return null
        }

        const target_token_indexes = [ ...new Set( segment.target_token_indexes ) ]
        const valid_indexes = target_token_indexes.every( index =>
            Number.isInteger( index ) && index >= 0 && index < target_word_count
        )
        if( !valid_indexes ) return null
        if( target_token_indexes.some( index => used_target_indexes.has( index ) ) ) return null

        target_token_indexes.forEach( index => used_target_indexes.add( index ) )
        validated_segments.push( {
            text: segment.text,
            target_token_indexes: target_token_indexes.sort( ( a, b ) => a - b )
        } )
    }

    // Every selectable word needs exactly one source-language locus.
    if( used_target_indexes.size !== target_word_count ) return null

    const ordered_indexes = [ ...used_target_indexes ].sort( ( a, b ) => a - b )
    if( ordered_indexes.some( ( index, expected ) => index !== expected ) ) return null

    const trimmed_segments = trim_alignment_boundaries( validated_segments )
    const meaning = trimmed_segments.map( segment => segment.text ).join( `` )
    if( !meaning.trim() ) return null

    return { meaning, alignment_segments: trimmed_segments }

}

/**
 * Parses and validates an aligned back-translation response.
 * Invalid or plain-text responses remain usable as meanings but never receive
 * guessed, fuzzy, or position-based alignments.
 * @param {string} content - Raw completion content
 * @param {string} translated_text - Target-language fragment used for index bounds
 * @returns {{ meaning: string, alignment_segments: Array<{ text: string, target_token_indexes: number[] }>, aligned: boolean }}
 */
export const parse_meaning_alignment_response = ( content, translated_text ) => {

    const plain_content = strip_json_fence( content )
    const parsed_content = parse_json_object( plain_content )
    const target_word_count = segment_translation_text( translated_text )
        .filter( segment => segment.is_word )
        .length

    if( parsed_content && typeof parsed_content === `object` && !Array.isArray( parsed_content ) ) {
        const validated = validate_alignment_segments( parsed_content.segments, target_word_count )
        const declared_meaning = typeof parsed_content.meaning === `string`
            ? parsed_content.meaning.trim()
            : ``

        if( validated ) {
            const meanings_match = !declared_meaning || declared_meaning === validated.meaning
            if( meanings_match ) return { ...validated, aligned: true }
        }

        const segment_meaning = Array.isArray( parsed_content.segments )
            ? parsed_content.segments
                .filter( segment => typeof segment?.text === `string` )
                .map( segment => segment.text )
                .join( `` )
                .trim()
            : ``
        const fallback_meaning = declared_meaning || segment_meaning

        if( fallback_meaning ) {
            return { meaning: fallback_meaning, alignment_segments: [], aligned: false }
        }
    }

    return {
        meaning: plain_content,
        alignment_segments: [],
        aligned: false
    }

}
