import { useState, useEffect, useCallback } from 'react'

// The first library mount downloads and parses the catalogue; later mounts re-request it
// (the service worker answers from cache and revalidates) but only re-parse when it changed.
let catalog_promise = null
let catalog_etag = null

const load_catalog = () => {
    catalog_promise ||= fetch( `/gutenberg.json` ).then( async response => {
        if( !response.ok ) throw new Error( `The server answered ${ response.status }.` )
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
 * @returns {{ books: Array, loading: boolean, error: string|null, retry: Function }}
 */
export const use_gutenberg = () => {

    const [ books, set_books ] = useState( [] )
    const [ loading, set_loading ] = useState( true )
    const [ error, set_error ] = useState( null )
    const [ attempt, set_attempt ] = useState( 0 )

    useEffect( () => {

        let mounted = true
        const already_loaded = !!catalog_promise

        set_loading( true )
        set_error( null )
        load_catalog()
            .then( data => {
                if( !mounted ) return
                set_books( data )
                set_loading( false )
                if( already_loaded ) return refresh_catalog().then( fresh => mounted && fresh && set_books( fresh ) )
            } )
            .catch( failure => {
                if( !mounted ) return
                set_loading( false )
                set_error( navigator.onLine === false
                    ? `You are offline. Connect to the internet and try again.`
                    : `Check your connection and try again. ${ failure?.message || `` }`.trim() )
            } )

        return () => {
            mounted = false
        }

    }, [ attempt ] )

    const retry = useCallback( () => set_attempt( current => current + 1 ), [] )

    return { books, loading, error, retry }

}
