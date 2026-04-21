import ePub from 'epubjs'
import { log } from 'mentie'
import { split_sentences } from './sentence_splitter.js'

/**
 * Parses an EPUB file and extracts metadata + content structure
 * @param {ArrayBuffer} array_buffer - The EPUB file data
 * @returns {Promise<Object>} { metadata, toc, spine, cover_url, book }
 */
export const parse_epub = async ( array_buffer ) => {

    const book = ePub( array_buffer )
    await book.ready

    // Load metadata — guard against epubjs failing to parse (e.g. image-heavy epubs)
    const metadata = await book.loaded?.metadata || {}
    log.info( `Parsed EPUB:`, metadata.title, `by`, metadata.creator )

    // Load cover URL
    let cover_url = null
    try {
        cover_url = await book.coverUrl()
    } catch ( error ) {
        log.debug( `No cover image found:`, error.message )
    }

    // Load table of contents and flatten nested subitems into a single list
    const navigation = await book.loaded?.navigation || {}
    const raw_toc = navigation.toc || []

    const flatten_toc = ( items ) => items.flatMap( item =>
        [ item, ... item.subitems?.length ? flatten_toc( item.subitems ) : []  ]
    )

    const toc = flatten_toc( raw_toc )

    // Load spine items
    const spine = book.spine?.spineItems || []

    return { metadata, toc, spine, cover_url, book }

}

/**
 * Extracts text content from a single spine item as structured paragraphs/sentences
 * @param {Object} book - The epubjs Book instance
 * @param {Object} spine_item - A spine item from book.spine.spineItems
 * @param {string} book_hash - The book's unique hash
 * @param {number} chapter_index - The chapter index in the spine
 * @returns {Promise<Object>} { elements: [{ type, text, sentences, ... }] }
 */
export const extract_chapter_content = async ( book, spine_item, book_hash, chapter_index ) => {

    // Load the document for this spine item
    const doc = await book.load( spine_item.href )
    const elements = []

    // Parse the document — it could be a Document or an HTML string
    let body
    if( doc instanceof Document ) {
        body = doc.body || doc.documentElement
    } else if( typeof doc === `string` ) {
        const parser = new DOMParser()
        const { body: parsed_body } = parser.parseFromString( doc, `text/html` )
        body = parsed_body
    } else {
        log.warn( `Unexpected content type for spine item:`, spine_item.href )
        return { elements: [] }
    }

    if( !body ) return { elements: [] }

    let paragraph_index = 0

    // Walk through child elements
    const walk_nodes = ( parent ) => {

        for( const node of parent.childNodes ) {

            if( node.nodeType === Node.TEXT_NODE ) {
                const text = node.textContent.trim()
                if( !text ) continue

                const sentences = split_sentences( text ).map( ( text, sentence_index ) => ( {
                    id: `${ book_hash }:${ chapter_index }:${ paragraph_index }:${ sentence_index }`,
                    text
                } ) )

                if( sentences.length > 0 ) {
                    elements.push( { type: `paragraph`, sentences } )
                    paragraph_index++
                }
                continue
            }

            if( node.nodeType !== Node.ELEMENT_NODE ) continue

            const tag = node.tagName.toLowerCase()

            // Skip non-content tags — these should never produce translatable text
            if( [ `script`, `style`, `noscript`, `svg`, `math`, `canvas`, `template` ].includes( tag ) ) continue

            // Headings
            if( /^h[1-6]$/.test( tag ) ) {
                const text = node.textContent.trim()
                if( text ) {
                    elements.push( {
                        type: `heading`,
                        level: parseInt( tag[1] ),
                        sentences: [ {
                            id: `${ book_hash }:${ chapter_index }:${ paragraph_index }:0`,
                            text
                        } ]
                    } )
                    paragraph_index++
                }
                continue
            }

            // Paragraphs
            if( tag === `p` ) {
                const text = node.textContent.trim()
                if( !text ) continue

                const sentences = split_sentences( text ).map( ( text, sentence_index ) => ( {
                    id: `${ book_hash }:${ chapter_index }:${ paragraph_index }:${ sentence_index }`,
                    text
                } ) )

                if( sentences.length > 0 ) {
                    elements.push( { type: `paragraph`, sentences } )
                    paragraph_index++
                }
                continue
            }

            // Lists
            if( tag === `ul` || tag === `ol` ) {
                // Use direct children only — querySelectorAll('li') would flatten nested lists
                const items = [ ...node.children ].filter( c => c.tagName?.toLowerCase() === `li` ).map( li => {
                    const text = li.textContent.trim()
                    const sentences = split_sentences( text ).map( ( text, sentence_index ) => ( {
                        id: `${ book_hash }:${ chapter_index }:${ paragraph_index }:${ sentence_index }`,
                        text
                    } ) )
                    paragraph_index++
                    return { sentences }
                } ).filter( item => item.sentences.length > 0 )

                if( items.length > 0 ) {
                    elements.push( { type: tag === `ol` ? `ordered_list` : `unordered_list`, items } )
                }
                continue
            }

            // Images
            if( tag === `img` ) {
                const src = node.getAttribute( `src` )
                const alt = node.getAttribute( `alt` ) || ``
                if( src ) elements.push( { type: `image`, src, alt } )
                continue
            }

            // Blockquotes
            if( tag === `blockquote` ) {
                const text = node.textContent.trim()
                if( text ) {
                    const sentences = split_sentences( text ).map( ( text, sentence_index ) => ( {
                        id: `${ book_hash }:${ chapter_index }:${ paragraph_index }:${ sentence_index }`,
                        text
                    } ) )
                    if( sentences.length > 0 ) {
                        elements.push( { type: `blockquote`, sentences } )
                        paragraph_index++
                    }
                }
                continue
            }

            // Tables — recurse into rows/cells so each cell becomes its own paragraph
            if( [ `table`, `tbody`, `thead`, `tfoot`, `tr` ].includes( tag ) ) {
                walk_nodes( node )
                continue
            }

            // Recurse into container elements
            if( [ `div`, `section`, `article`, `span`, `main`, `aside`, `header`, `footer`, `figure`, `figcaption`, `nav`, `details`, `summary` ].includes( tag ) ) {
                walk_nodes( node )
                continue
            }

            // Fallback: treat as paragraph if it has text content
            const text = node.textContent.trim()
            if( text ) {
                const sentences = split_sentences( text ).map( ( text, sentence_index ) => ( {
                    id: `${ book_hash }:${ chapter_index }:${ paragraph_index }:${ sentence_index }`,
                    text
                } ) )
                if( sentences.length > 0 ) {
                    elements.push( { type: `paragraph`, sentences } )
                    paragraph_index++
                }
            }
        }

    }

    walk_nodes( body )

    return { elements }

}

/**
 * Generates a hash from an ArrayBuffer (first 8KB for speed)
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>} Hex hash string
 */
export const hash_buffer = async ( buffer ) => {

    const slice = buffer.slice( 0, 8192 )
    const hash_buffer = await crypto.subtle.digest( `SHA-256`, slice )
    const hash_array = Array.from( new Uint8Array( hash_buffer ) )
    return hash_array.map( b => b.toString( 16 ).padStart( 2, `0` ) ).join( `` ).slice( 0, 12 )

}
