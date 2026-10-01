import { useState, useEffect } from 'react'

// The first library mount downloads and parses the catalogue; later mounts re-request it
// (the service worker answers from cache and revalidates) but only re-parse when it changed.
let catalog_promise = null
let catalog_etag = null

const load_catalog = () => {
    catalog_promise ||= fetch( `/gutenberg.json` ).then( async response => {
        catalog_etag = response.headers.get( `etag` ) || response.headers.get( `last-modified` )
        return response.json()
    } ).catch( error => {
        catalog_promise = null
        throw error
    } )
    return catalog_promise
}

const refresh_catalog = async () => {
    const response = await fetch( `/gutenberg.json` )
    const etag = response.headers.get( `etag` ) || response.headers.get( `last-modified` )
    if( etag && etag === catalog_etag ) return null
    catalog_etag = etag
    const books = await response.json()
    catalog_promise = Promise.resolve( books )
    return books
}

/**
 * Fetches the Gutenberg book catalog from the static JSON file
 * @returns {{ books: Array, loading: boolean }}
 */
export const use_gutenberg = () => {

    const [ books, set_books ] = useState( [] )
    const [ loading, set_loading ] = useState( true )

    useEffect( () => {

        let mounted = true
        const already_loaded = !!catalog_promise

        load_catalog()
            .then( data => {
                if( !mounted ) return
                set_books( data )
                set_loading( false )
                if( already_loaded ) return refresh_catalog().then( fresh => mounted && fresh && set_books( fresh ) )
            } )
            .catch( () => mounted && set_loading( false ) )

        return () => {
            mounted = false
        }

    }, [] )

    return { books, loading }

}
