import { create } from 'zustand'
import { get_all_books, save_book, delete_book as db_delete_book, get_book } from '../modules/cache.js'
import { log } from 'mentie'

/**
 * Book library state — metadata synced from IndexedDB
 */
export const use_library_store = create( ( set, get ) => ( {

    books: [],
    loading: true,

    // Load all books from IndexedDB into memory
    load_books: async () => {
        try {
            const books = await get_all_books()
            set( { books, loading: false } )
        } catch ( error ) {
            log.error( `Failed to load books:`, error )
            set( { loading: false } )
        }
    },

    // Add a new book to IndexedDB and update state
    add_book: async ( book_record ) => {
        await save_book( book_record )
        const books = await get_all_books()
        set( { books } )
    },

    // Remove a book from IndexedDB and update state
    remove_book: async ( id ) => {
        await db_delete_book( id )
        set( { books: get().books.filter( b => b.id !== id ) } )
    },

    // Get a single book by ID
    get_book: async ( id ) => {
        return await get_book( id )
    },

} ) )
