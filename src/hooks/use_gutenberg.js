import { useState, useEffect } from 'react'

/**
 * Fetches the Gutenberg book catalog from the static JSON file
 * @returns {{ books: Array, loading: boolean }}
 */
export const use_gutenberg = () => {

    const [ books, set_books ] = useState( [] )
    const [ loading, set_loading ] = useState( true )

    useEffect( () => {

        fetch( `/gutenberg.json` )
            .then( r => r.json() )
            .then( data => {
                set_books( data )
                set_loading( false )
            } )
            .catch( () => set_loading( false ) )

    }, [] )

    return { books, loading }

}
