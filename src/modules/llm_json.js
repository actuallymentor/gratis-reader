// Models asked for JSON sometimes wrap it in code fences or follow it with prose
// ("Wait, I should…"). Take the first balanced object or array and parse that.

/**
 * Extracts the first JSON object or array from free-form model output
 * @param {string} text
 * @returns {Object|Array|null} Parsed value, or null when none parses
 */
export const extract_json = ( text ) => {

    const stripped = String( text || `` ).replace( /```(?:json)?/gi, `` )
    const start = stripped.search( /[[{]/ )
    if( start < 0 ) return null

    const open = stripped[start]
    const close = open === `{` ? `}` : `]`
    let depth = 0
    let in_string = false

    for( let i = start; i < stripped.length; i++ ) {
        const ch = stripped[i]

        if( in_string ) {
            if( ch === `\\` ) i += 1
            else if( ch === `"` ) in_string = false
            continue
        }

        if( ch === `"` ) in_string = true
        else if( ch === open ) depth += 1
        else if( ch === close && --depth === 0 ) {
            try {
                return JSON.parse( stripped.slice( start, i + 1 ) )
            } catch {
                return null
            }
        }
    }

    return null

}

/**
 * Reads a named string array of an exact length out of model output.
 * Entries that are not non-empty strings come back as null so callers can
 * fall back for just those items.
 * @param {string} text - Raw model output
 * @param {string} field - Array field name, e.g. `translations`
 * @param {number} expected_length
 * @returns {Array<string|null>|null} null when the output has no usable array of that length
 */
export const extract_string_array = ( text, field, expected_length ) => {

    const parsed = extract_json( text )
    const values = Array.isArray( parsed ) ? parsed : parsed?.[field]
    if( !Array.isArray( values ) || values.length !== expected_length ) return null

    return values.map( value => typeof value === `string` && value.trim() ? value.trim() : null )

}
