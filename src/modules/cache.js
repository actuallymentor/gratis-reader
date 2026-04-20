
const DB_NAME = `gratis_reader`
const DB_VERSION = 3

// Cached connection to avoid reopening on every operation
let cached_db = null

/**
 * Opens (or creates) the IndexedDB database.
 * Reuses a cached connection when available.
 * @returns {Promise<IDBDatabase>}
 */
export const open_db = () => {

    // Return cached connection if still open
    if( cached_db ) {
        try {
            // Verify the connection is still alive by checking objectStoreNames
            cached_db.objectStoreNames
            return Promise.resolve( cached_db )
        } catch {
            // Connection was closed — re-open below
            cached_db = null
        }
    }

    return new Promise( ( resolve, reject ) => {

        const request = indexedDB.open( DB_NAME, DB_VERSION )

        request.onupgradeneeded = ( event ) => {
            const db = event.target.result

            // Books store
            if( !db.objectStoreNames.contains( `books` ) ) {
                db.createObjectStore( `books`, { keyPath: `id` } )
            }

            // Translation cache store
            if( !db.objectStoreNames.contains( `translations` ) ) {
                db.createObjectStore( `translations`, { keyPath: `key` } )
            }

            // Reading progress store
            if( !db.objectStoreNames.contains( `progress` ) ) {
                db.createObjectStore( `progress`, { keyPath: `book_id` } )
            }

            // Token usage tracking store (per-book cumulative totals)
            if( !db.objectStoreNames.contains( `token_usage` ) ) {
                db.createObjectStore( `token_usage`, { keyPath: `book_id` } )
            }
        }

        request.onsuccess = () => {
            cached_db = request.result
            // Clear cache if the connection is closed externally
            cached_db.onclose = () => {
                cached_db = null 
            }
            resolve( cached_db )
        }
        request.onerror = () => reject( request.error )

    } )

}

// --- Book operations ---

/**
 * Saves a book record to IndexedDB
 * @param {Object} book_record - { id, title, author, language, cover_image, file, added_at }
 */
export const save_book = async ( book_record ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `books`, `readwrite` )
        tx.objectStore( `books` ).put( book_record )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}

/**
 * Gets all books from IndexedDB
 * @returns {Promise<Object[]>}
 */
export const get_all_books = async () => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `books`, `readonly` )
        const request = tx.objectStore( `books` ).getAll()
        request.onsuccess = () => resolve( request.result )
        request.onerror = () => reject( request.error )
    } )
}

/**
 * Gets a single book by ID
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
export const get_book = async ( id ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `books`, `readonly` )
        const request = tx.objectStore( `books` ).get( id )
        request.onsuccess = () => resolve( request.result )
        request.onerror = () => reject( request.error )
    } )
}

/**
 * Deletes a book and its associated translations + progress
 * @param {string} id - The book ID (also the book hash used in sentence IDs)
 */
export const delete_book = async ( id ) => {
    const db = await open_db()

    // Delete the book record + progress + token usage in one transaction
    await new Promise( ( resolve, reject ) => {
        const tx = db.transaction( [ `books`, `progress`, `token_usage` ], `readwrite` )
        tx.objectStore( `books` ).delete( id )
        tx.objectStore( `progress` ).delete( id )
        tx.objectStore( `token_usage` ).delete( id )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )

    // Clean up orphaned translations (keys start with the raw book hash, without "book_" prefix)
    const hash_prefix = id.replace( /^book_/, `` )
    await new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `translations`, `readwrite` )
        const store = tx.objectStore( `translations` )
        const request = store.openCursor()

        request.onsuccess = ( e ) => {
            const cursor = e.target.result
            if( !cursor ) return
            if( cursor.key.startsWith( `${ hash_prefix }:` ) ) cursor.delete()
            cursor.continue()
        }

        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}

// --- Translation cache operations ---

/**
 * Saves a translation cache entry
 * @param {Object} entry - { key, original, translated, language, level, created_at }
 */
export const save_translation = async ( entry ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `translations`, `readwrite` )
        tx.objectStore( `translations` ).put( entry )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}

/**
 * Gets a cached translation by key
 * @param {string} cache_key
 * @returns {Promise<string|null>} The translated text or null
 */
export const get_translation = async ( cache_key ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `translations`, `readonly` )
        const request = tx.objectStore( `translations` ).get( cache_key )
        request.onsuccess = () => resolve( request.result?.translated || null )
        request.onerror = () => reject( request.error )
    } )
}

/**
 * Clears all cached translations
 */
export const clear_translations = async () => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `translations`, `readwrite` )
        tx.objectStore( `translations` ).clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}

// --- Reading progress operations ---

/**
 * Saves reading progress for a book
 * @param {Object} progress - { book_id, chapter_index, scroll_position, last_read_at }
 */
export const save_progress = async ( progress ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `progress`, `readwrite` )
        tx.objectStore( `progress` ).put( progress )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}

/**
 * Gets reading progress for a book
 * @param {string} book_id
 * @returns {Promise<Object|undefined>}
 */
export const get_progress = async ( book_id ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `progress`, `readonly` )
        const request = tx.objectStore( `progress` ).get( book_id )
        request.onsuccess = () => resolve( request.result )
        request.onerror = () => reject( request.error )
    } )
}

// --- Token usage operations ---

/**
 * Gets cumulative token usage for a book
 * @param {string} book_id
 * @returns {Promise<{ book_id: string, prompt_tokens: number, completion_tokens: number }|undefined>}
 */
export const get_token_usage = async ( book_id ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `token_usage`, `readonly` )
        const request = tx.objectStore( `token_usage` ).get( book_id )
        request.onsuccess = () => resolve( request.result )
        request.onerror = () => reject( request.error )
    } )
}

/**
 * Adds token usage to a book's cumulative total (read-modify-write)
 * @param {string} book_id
 * @param {number} prompt_tokens - Tokens to add to prompt total
 * @param {number} completion_tokens - Tokens to add to completion total
 */
export const add_token_usage = async ( book_id, prompt_tokens, completion_tokens ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `token_usage`, `readwrite` )
        const store = tx.objectStore( `token_usage` )
        const request = store.get( book_id )

        request.onsuccess = () => {
            const existing = request.result || { book_id, prompt_tokens: 0, completion_tokens: 0 }
            existing.prompt_tokens += prompt_tokens
            existing.completion_tokens += completion_tokens
            store.put( existing )
        }

        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}
