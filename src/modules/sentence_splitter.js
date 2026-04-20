/**
 * Splits text into sentences, handling common abbreviations and edge cases
 * @param {string} text - Raw paragraph text
 * @returns {string[]} Array of sentences
 */
export const split_sentences = ( text ) => {

    if( !text || !text.trim() ) return []

    // Normalize Unicode to NFC to prevent cache key mismatches from decomposed characters
    text = text.normalize( `NFC` )

    // Common abbreviations to avoid splitting on
    const abbreviations = new Set( [
        `mr`, `mrs`, `ms`, `dr`, `prof`, `sr`, `jr`,
        `st`, `ave`, `blvd`, `dept`, `est`, `vol`,
        `inc`, `ltd`, `co`, `corp`, `vs`, `etc`,
        `approx`, `div`, `govt`,
        `e.g`, `i.e`, `cf`, `al`, `fig`, `no`
    ] )

    const sentences = []
    let current = ``
    let i = 0

    while( i < text.length ) {

        current += text[i]

        // Check if this could be a sentence boundary (including CJK punctuation and unicode ellipsis)
        const ch = text[i]
        const is_cjk_terminal = ch === `\u3002` || ch === `\uFF01` || ch === `\uFF1F`  // 。！？
        if( ch === `.` || ch === `!` || ch === `?` || is_cjk_terminal ) {

            const rest = text.slice( i + 1 )

            // CJK terminals (。！？) always split — no space or uppercase required
            if( is_cjk_terminal && rest.trim().length > 0 ) {
                sentences.push( current.trim() )
                current = ``
                i++
                continue
            }

            // For Latin script: look ahead for whitespace followed by next word
            const next_char_match = rest.match( /^\s+(\S)/ )

            if( !next_char_match ) {
                // End of text — this is the last sentence
                i++
                continue
            }

            const [ , next_char ] = next_char_match
            const has_case = next_char.toUpperCase() !== next_char.toLowerCase()
            // Latin letters: must be uppercase. Non-ASCII caseless chars (CJK, Arabic, etc.): always valid sentence starters.
            const is_uppercase = has_case ? next_char === next_char.toUpperCase() : next_char.charCodeAt( 0 ) > 127

            // Check for abbreviation or initial (e.g. "J." or "J.K." or "U.S.A.")
            const word_before = current.trim().split( /\s+/ ).pop().replace( /\.$/, `` ).toLowerCase()
            const is_abbreviation = abbreviations.has( word_before )
            const is_initial = /^[a-z](\.[a-z])*$/i.test( word_before )

            // Check for decimal numbers (e.g., 3.14)
            const is_decimal = text[i] === `.` && /\d$/.test( current.slice( 0, -1 ) ) && /^\d/.test( rest )

            // Check for ellipsis (ASCII "...")
            const is_ellipsis = text[i] === `.` && ( text[i + 1] === `.` || current.endsWith( `..` ) )

            // Check if next char is a quote followed by uppercase (e.g., 'said Bob. "How are you?"')
            const quote_then_upper = /^["'"'\u201C\u201D\u2018\u2019]/.test( next_char ) && /^["'"'\u201C\u201D\u2018\u2019]\s*[A-Z]/.test( rest.replace( /^\s+/, `` ) )
            const effective_uppercase = is_uppercase || quote_then_upper

            if( !is_abbreviation && !is_initial && !is_decimal && !is_ellipsis && effective_uppercase ) {
                sentences.push( current.trim() )
                current = ``
            }
        }

        i++
    }

    // Push any remaining text
    if( current.trim() ) sentences.push( current.trim() )

    // Safety valve: split any very long sentences (>500 chars) at natural break points
    const MAX_SENTENCE_LEN = 500
    return sentences.flatMap( sentence => {
        if( sentence.length <= MAX_SENTENCE_LEN ) return [ sentence ]
        // Try splitting on semicolons, colons, or em-dashes
        const parts = sentence.split( /(?<=[;:—])\s+/ ).filter( p => p.trim() )
        return parts.length > 1 ? parts : [ sentence ]
    } )

}
