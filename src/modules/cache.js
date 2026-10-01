import { log } from 'mentie'


const DB_NAME = `gratis_reader`
const DB_VERSION = 5

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

            // Legacy back-translations remain readable so older databases can be cleaned safely.
            if( !db.objectStoreNames.contains( `meanings` ) ) {
                db.createObjectStore( `meanings`, { keyPath: `key` } )
            }

            // Reading progress store
            if( !db.objectStoreNames.contains( `progress` ) ) {
                db.createObjectStore( `progress`, { keyPath: `book_id` } )
            }

            // Token usage tracking store (per-book cumulative totals)
            if( !db.objectStoreNames.contains( `token_usage` ) ) {
                db.createObjectStore( `token_usage`, { keyPath: `book_id` } )
            }

            // Parsed EPUB structure (metadata, toc, spine) so reopening a book skips the zip parse
            if( !db.objectStoreNames.contains( `book_index` ) ) {
                db.createObjectStore( `book_index`, { keyPath: `book_id` } )
            }

            // Parsed chapter elements keyed `${ book_hash }:${ chapter_index }`
            if( !db.objectStoreNames.contains( `chapters` ) ) {
                db.createObjectStore( `chapters`, { keyPath: `key` } )
            }
        }

        request.onsuccess = () => {
            cached_db = request.result
            // Clear cache if the connection is closed externally
            cached_db.onclose = () => {
                cached_db = null 
            }
            // Another tab is upgrading the schema: let go so its open request is not blocked
            cached_db.onversionchange = () => {
                cached_db.close()
                cached_db = null
            }
            resolve( cached_db )
        }
        request.onblocked = () => log.warn( `IndexedDB upgrade is blocked by another open tab of this app` )
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

// Simple single-store helpers: one short transaction per call
const read_record = async ( store_name, key ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const request = db.transaction( store_name, `readonly` ).objectStore( store_name ).get( key )
        request.onsuccess = () => resolve( request.result )
        request.onerror = () => reject( request.error )
    } )
}

const write_record = async ( store_name, record ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( store_name, `readwrite` )
        tx.objectStore( store_name ).put( record )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}

const chapter_key_range = book_hash => IDBKeyRange.bound( `${ book_hash }:`, `${ book_hash }:\uffff` )

/**
 * Deletes a book, its reading progress, token usage, and parsed structure.
 * Cached translations are deliberately kept: they are expensive to recreate and
 * their keys are content hashes, so a re-import of the same book reuses them.
 * @param {string} id
 */
export const delete_book = async ( id ) => {
    const db = await open_db()
    const index = await read_record( `book_index`, id )

    await new Promise( ( resolve, reject ) => {
        const tx = db.transaction( [ `books`, `progress`, `token_usage`, `book_index`, `chapters` ], `readwrite` )
        tx.objectStore( `books` ).delete( id )
        tx.objectStore( `progress` ).delete( id )
        tx.objectStore( `token_usage` ).delete( id )
        tx.objectStore( `book_index` ).delete( id )
        if( index?.book_hash ) tx.objectStore( `chapters` ).delete( chapter_key_range( index.book_hash ) )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}

// --- Parsed structure operations ---

/**
 * Gets the parsed EPUB structure for a book
 * @param {string} book_id
 * @returns {Promise<Object|undefined>} { book_id, book_hash, parser_version, metadata, toc, spine }
 */
export const get_book_index = ( book_id ) => read_record( `book_index`, book_id )

/**
 * Saves the parsed EPUB structure for a book
 * @param {Object} index - { book_id, book_hash, parser_version, metadata, toc, spine }
 */
export const save_book_index = ( index ) => write_record( `book_index`, index )

/**
 * Drops every cached chapter of a book hash, e.g. when the stored file changed under the same hash
 * @param {string} book_hash
 */
export const delete_chapters = async ( book_hash ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `chapters`, `readwrite` )
        tx.objectStore( `chapters` ).delete( chapter_key_range( book_hash ) )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}

/**
 * Gets parsed chapter elements
 * @param {string} key - `${ book_hash }:${ chapter_index }`
 * @returns {Promise<Object|undefined>} { key, parser_version, elements }
 */
export const get_chapter = ( key ) => read_record( `chapters`, key )

/**
 * Saves parsed chapter elements
 * @param {Object} chapter - { key, parser_version, elements }
 */
export const save_chapter = ( chapter ) => write_record( `chapters`, chapter )

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
 * Gets many cached translations in one read transaction
 * @param {string[]} cache_keys
 * @returns {Promise<Object>} cache_key → translated text, misses omitted
 */
export const get_translations = async ( cache_keys ) => {
    if( !cache_keys.length ) return {}
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const found = {}
        let remaining = cache_keys.length
        const tx = db.transaction( `translations`, `readonly` )
        const store = tx.objectStore( `translations` )
        // Settle on the last request's result, like single reads do, rather than on transaction completion
        cache_keys.forEach( cache_key => {
            const request = store.get( cache_key )
            request.onsuccess = () => {
                if( request.result?.translated ) found[cache_key] = request.result.translated
                if( --remaining === 0 ) resolve( found )
            }
            request.onerror = () => reject( request.error )
        } )
        tx.onerror = () => reject( tx.error )
    } )
}

/**
 * Deletes a cached translation by key
 * @param {string} cache_key
 */
export const delete_translation = async ( cache_key ) => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( `translations`, `readwrite` )
        tx.objectStore( `translations` ).delete( cache_key )
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject( tx.error )
    } )
}

/**
 * Clears translations and legacy source-language meanings.
 */
export const clear_translations = async () => {
    const db = await open_db()
    return new Promise( ( resolve, reject ) => {
        const tx = db.transaction( [ `translations`, `meanings` ], `readwrite` )
        tx.objectStore( `translations` ).clear()
        tx.objectStore( `meanings` ).clear()
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
