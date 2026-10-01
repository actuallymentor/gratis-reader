import { useState, useEffect } from 'react'

// One download per page load: the library mounts again every time a reader is closed
let catalog_promise = null
const load_catalog = () => {
    catalog_promise ||= fetch( `/gutenberg.json` ).then( r => r.json() ).catch( error => {
        catalog_promise = null
        throw error
    } )
    return catalog_promise
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

        load_catalog()
            .then( data => {
                if( !mounted ) return
                set_books( data )
                set_loading( false )
            } )
            .catch( () => mounted && set_loading( false ) )

        return () => {
            mounted = false
        }

    }, [] )

    return { books, loading }

}
