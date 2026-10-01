// Imports that open the reader straight away parse the EPUB once and hand the
// result over, instead of the reader re-reading and re-parsing the same bytes.

const HANDOFF_TTL_MS = 60_000
const pending = new Map()

/**
 * Claims a parsed book offered for this id, if any. The caller owns the archive afterwards.
 * @param {string} book_id
 * @returns {{ parsed: Object, array_buffer: ArrayBuffer }|undefined}
 */
export const take_parsed_book = ( book_id ) => {
    const offer = pending.get( book_id )
    if( !offer ) return undefined
    clearTimeout( offer.timer )
    pending.delete( book_id )
    return offer
}

/**
 * Offers a freshly parsed book to the next reader mount for this id.
 * Unclaimed offers are destroyed after a minute so archives do not leak.
 * @param {string} book_id
 * @param {{ parsed: Object, array_buffer: ArrayBuffer }} offer
 */
export const offer_parsed_book = ( book_id, offer ) => {
    take_parsed_book( book_id )?.parsed.book?.destroy()
    const timer = setTimeout( () => take_parsed_book( book_id )?.parsed.book?.destroy(), HANDOFF_TTL_MS )
    pending.set( book_id, { ...offer, timer } )
}
