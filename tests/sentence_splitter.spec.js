/**
 * split_sentences is a pure module: these run in the Playwright worker (Node),
 * with no browser page, so the whole file costs milliseconds.
 */
import { test, expect } from '@playwright/test'
import { split_sentences } from '../src/modules/sentence_splitter.js'

// Builds an unpunctuated clause of roughly `words` words
const clause = ( lead, words ) => `${ lead } ${ Array.from( { length: words }, ( _, i ) => `word${ i }` ).join( ` ` ) }`

test.describe( `Sentence splitter`, () => {

    // --- CJK ---

    test( `splits on CJK terminals (。！？) without needing spaces`, () => {
        expect( split_sentences( `这是第一句。这是第二句。第三句！` ) ).toEqual( [ `这是第一句。`, `这是第二句。`, `第三句！` ] )
        expect( split_sentences( `你好吗？我很好。` ) ).toEqual( [ `你好吗？`, `我很好。` ] )
        expect( split_sentences( `这是唯一的句子。` ) ).toEqual( [ `这是唯一的句子。` ] )
    } )

    test( `splits mixed CJK and Latin text`, () => {
        expect( split_sentences( `Hello world. 你好世界。Goodbye.` ) ).toEqual( [ `Hello world.`, `你好世界。`, `Goodbye.` ] )
    } )

    // --- Latin edge cases ---

    test( `does not treat a Unicode ellipsis as a sentence boundary`, () => {
        expect( split_sentences( `Wait\u2026 really? Yes.` ) ).toEqual( [ `Wait\u2026 really?`, `Yes.` ] )
    } )

    test( `returns no sentences for empty, whitespace or missing input`, () => {
        for( const input of [ ``, `   `, null, undefined ] ) {
            expect( split_sentences( input ) ).toEqual( [] )
        }
    } )

    test( `keeps decimal numbers intact`, () => {
        expect( split_sentences( `The value is 3.14 approximately. That is pi.` ) )
            .toEqual( [ `The value is 3.14 approximately.`, `That is pi.` ] )
    } )

    test( `does not split after common abbreviations`, () => {
        expect( split_sentences( `Dr. Smith and Prof. Jones met at St. Mary's hospital. They discussed the results.` ) ).toEqual( [
            `Dr. Smith and Prof. Jones met at St. Mary's hospital.`,
            `They discussed the results.`
        ] )
    } )

    test( `does not split inside a quoted sentence end`, () => {
        const text = `She said "hello." Then she left.`
        const result = split_sentences( text )

        // The quoted period never cuts the quote in half, and no text is lost
        expect( result[ 0 ] ).toContain( `"hello."` )
        expect( result.join( ` ` ) ).toBe( text )
    } )

    // --- Safety valve for very long sentences (BW68) ---

    test( `splits sentences over 500 chars at semicolons, colons and em-dashes`, () => {

        const parts = [
            `${ clause( `First`, 30 ) };`,
            `${ clause( `second`, 30 ) }:`,
            `${ clause( `third`, 30 ) } —`,
            clause( `fourth`, 30 )
        ]
        const long_text = parts.join( ` ` )
        expect( long_text.length ).toBeGreaterThan( 500 )

        expect( split_sentences( long_text ) ).toEqual( parts )

    } )

    test( `leaves long text alone when it is under the limit or has no break points`, () => {

        // Under 500 chars: never split, even with break points
        const short_text = `${ clause( `First`, 10 ) }; ${ clause( `second`, 10 ) }`
        expect( split_sentences( short_text ) ).toEqual( [ short_text ] )

        // Over 500 chars without break points: nothing to split on
        const unbreakable = clause( `Only`, 80 )
        expect( unbreakable.length ).toBeGreaterThan( 500 )
        expect( split_sentences( unbreakable ) ).toEqual( [ unbreakable ] )

    } )

    // --- Unicode normalisation (BW69) ---

    test( `normalises decomposed characters to NFC`, () => {

        // '\u00E9' as e + combining acute accent
        const result = split_sentences( `Caf\u0065\u0301 is nice. It\u2019s great.` )

        expect( result ).toEqual( [ `Caf\u00E9 is nice.`, `It\u2019s great.` ] )
        expect( result[ 0 ] ).not.toContain( `\u0301` )

    } )

} )
