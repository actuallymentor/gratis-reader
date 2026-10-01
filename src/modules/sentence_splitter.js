// Common abbreviations to avoid splitting on
const ABBREVIATIONS = new Set( [
    `mr`, `mrs`, `ms`, `dr`, `prof`, `sr`, `jr`,
    `st`, `ave`, `blvd`, `dept`, `est`, `vol`,
    `inc`, `ltd`, `co`, `corp`, `vs`, `etc`,
    `approx`, `div`, `govt`,
    `e.g`, `i.e`, `cf`, `al`, `fig`, `no`
] )

const QUOTE_CHARS = `"'“”‘’`

// Sticky regexes read ahead in place instead of slicing the remaining text per terminal.
const NEXT_WORD_RE = /\s+(\S)/y
const REMAINING_TEXT_RE = /\s*\S/y
const QUOTE_THEN_UPPER_RE = new RegExp( `\\s+[${ QUOTE_CHARS }]\\s*[A-Z]`, `y` )
const INITIAL_RE = /^[a-z](\.[a-z])*$/i
const DIGIT_RE = /\d/
const WHITESPACE_RE = /\s/

const match_at = ( regex, text, index ) => {
    regex.lastIndex = index
    return regex.exec( text )
}

const is_cjk_terminal = ch => ch === `。` || ch === `！` || ch === `？`  // 。！？

/**
 * Splits text into sentences, handling common abbreviations and edge cases
 * @param {string} text - Raw paragraph text
 * @returns {string[]} Array of sentences
 */
export const split_sentences = ( text ) => {

    if( !text || !text.trim() ) return []

    // Normalize Unicode to NFC to prevent cache key mismatches from decomposed characters
    text = text.normalize( `NFC` )

    const sentences = []
    let sentence_start = 0
    let word_start = 0

    const push_sentence = ( end ) => {
        const sentence = text.slice( sentence_start, end ).trim()
        if( sentence ) sentences.push( sentence )
        sentence_start = end
        word_start = end
    }

    for( let i = 0; i < text.length; i++ ) {

        const ch = text[i]

        if( WHITESPACE_RE.test( ch ) ) {
            word_start = i + 1
            continue
        }

        // Check if this could be a sentence boundary (including CJK punctuation and unicode ellipsis)
        const cjk = is_cjk_terminal( ch )
        if( ch !== `.` && ch !== `!` && ch !== `?` && !cjk ) continue

        // CJK terminals (。！？) always split — no space or uppercase required
        if( cjk ) {
            if( match_at( REMAINING_TEXT_RE, text, i + 1 ) ) push_sentence( i + 1 )
            continue
        }

        // For Latin script: look ahead for whitespace followed by next word
        const next_word = match_at( NEXT_WORD_RE, text, i + 1 )
        if( !next_word ) continue

        const [ , next_char ] = next_word
        const has_case = next_char.toUpperCase() !== next_char.toLowerCase()
        // Latin letters: must be uppercase. Non-ASCII caseless chars (CJK, Arabic, etc.): always valid sentence starters.
        const is_uppercase = has_case ? next_char === next_char.toUpperCase() : next_char.charCodeAt( 0 ) > 127

        // Check for abbreviation or initial (e.g. "J." or "J.K." or "U.S.A.")
        // A trailing period is dropped from the word; "!" and "?" stay part of it.
        const word_before = text.slice( word_start, ch === `.` ? i : i + 1 ).toLowerCase()
        const is_abbreviation = ABBREVIATIONS.has( word_before )
        const is_initial = INITIAL_RE.test( word_before )

        // Check for decimal numbers (e.g., 3.14)
        const is_decimal = ch === `.` && DIGIT_RE.test( text[i - 1] || `` ) && DIGIT_RE.test( text[i + 1] || `` )

        // Check for ellipsis (ASCII "...")
        const is_ellipsis = ch === `.` && ( text[i + 1] === `.` || text[i - 1] === `.` )

        // Check if next char is a quote followed by uppercase (e.g., 'said Bob. "How are you?"')
        const quote_then_upper = !!match_at( QUOTE_THEN_UPPER_RE, text, i + 1 )
        const effective_uppercase = is_uppercase || quote_then_upper

        if( !is_abbreviation && !is_initial && !is_decimal && !is_ellipsis && effective_uppercase ) push_sentence( i + 1 )

    }

    // Push any remaining text
    push_sentence( text.length )

    // Safety valve: split any very long sentences (>500 chars) at natural break points
    const MAX_SENTENCE_LEN = 500
    return sentences.flatMap( sentence => {
        if( sentence.length <= MAX_SENTENCE_LEN ) return [ sentence ]
        // Try splitting on semicolons, colons, or em-dashes
        const parts = sentence.split( /(?<=[;:—])\s+/ ).filter( p => p.trim() )
        return parts.length > 1 ? parts : [ sentence ]
    } )

}
