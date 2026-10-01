// One object URL per book cover for the page's lifetime. Every library visit reloads
// books from IndexedDB and hands back new Blob objects for the same cover; revoking and
// re-creating URLs on each change races the <img> still fetching the previous one.
const cover_urls = new Map()

/**
 * Returns a stable object URL for a book's cover blob
 * @param {{ id: string, cover_image?: Blob }} book
 * @returns {string|null}
 */
export const cover_url_for = ( book ) => {
    if( !book?.cover_image ) return null
    const key = `${ book.id }:${ book.cover_image.size }:${ book.cover_image.type }`
    if( !cover_urls.has( key ) ) cover_urls.set( key, URL.createObjectURL( book.cover_image ) )
    return cover_urls.get( key )
}

/**
 * Revokes the cover URLs of a removed book
 * @param {string} book_id
 */
export const release_cover_url = ( book_id ) => {
    cover_urls.forEach( ( url, key ) => {
        if( !key.startsWith( `${ book_id }:` ) ) return
        URL.revokeObjectURL( url )
        cover_urls.delete( key )
    } )
}
