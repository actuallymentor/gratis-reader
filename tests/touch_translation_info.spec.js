import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, clear_storage } from './helpers/setup.js'

const CHAT_URL = `**/openrouter.ai/api/v1/chat/completions`
const READER_WORD_TOOLTIP = `[data-reader-word-tooltip]`

const adapted_translation_from = ( prompt ) => {
    const match = prompt.match( /Adapted translation:\n(.+?)(?:\n\n|$)/s )
    return match ? match[1].trim() : `Unknown translation`
}

const translated_sentence_from = ( prompt ) => {
    const match = prompt.match( /Translate this sentence:\n(.+)/s )
    return match ? match[1].trim() : `unknown`
}

const install_translation_mock = async ( page, {
    word_lookup_content,
    translated_content
} = {} ) => {
    const calls = {
        explanation: 0,
        meaning: 0,
        word_lookup: 0
    }

    await page.route( CHAT_URL, async route => {
        const body = JSON.parse( route.request().postData() )
        const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``

        let content
        if( user_msg.includes( `Explain this translation` ) ) {
            calls.explanation += 1
            content = `Detailed explanation here.`
        } else if( user_msg.includes( `Word:` ) ) {
            calls.word_lookup += 1
            const word_match = user_msg.match( /Word:\s*(.+)$/ )
            content = word_lookup_content
                ?? `Source ${ word_match ? word_match[1].trim() : `word` }`
        } else if( user_msg.includes( `Adapted translation:` ) ) {
            calls.meaning += 1
            content = `Simplified ${ calls.meaning } ${ adapted_translation_from( user_msg ) }`
        } else {
            content = translated_content ?? `Target ${ translated_sentence_from( user_msg ) }`
        }

        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                choices: [ { message: { content } } ],
                usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
            } )
        } )
    } )

    return calls
}

const translation_words = ( sentence ) => sentence.locator( `[data-translation-word-index]` )

test.describe( `Touch translation information`, () => {

    test.use( {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true
    } )

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    test( `tapping words keeps one sheet and moves one contextual tooltip`, async ( { page } ) => {

        const calls = await install_translation_mock( page )
        await open_reader( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const words = translation_words( sentence )
        await expect( words.nth( 1 ) ).toBeVisible( { timeout: 15_000 } )

        const first_word = words.nth( 0 )
        const second_word = words.nth( 1 )
        const sheet = page.locator( `[data-translation-info-sheet]` )

        await first_word.tap()

        await expect( sheet ).toBeVisible()
        await expect( sheet ).toContainText( `Simplified 1 Target` )
        await expect( first_word ).toHaveAttribute( `aria-pressed`, `true` )
        await expect( first_word ).toHaveCSS( `text-decoration-line`, `none` )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText(
            `Source ${ await first_word.getAttribute( `data-translation-word` ) }`
        )
        await expect( page.getByRole( `dialog`, { name: `Translation Explanation` } ) ).not.toBeVisible()

        await sheet.evaluate( element => { window.__translation_info_sheet = element } )
        await second_word.tap()

        await expect( sheet ).toHaveCount( 1 )
        expect( await sheet.evaluate( element => element === window.__translation_info_sheet ) ).toBe( true )
        await expect( first_word ).toHaveAttribute( `aria-pressed`, `false` )
        await expect( second_word ).toHaveAttribute( `aria-pressed`, `true` )
        await expect( second_word ).toHaveCSS( `text-decoration-line`, `none` )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveCount( 1 )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText(
            `Source ${ await second_word.getAttribute( `data-translation-word` ) }`
        )

        const [ word_box, tooltip_box ] = await Promise.all( [
            second_word.boundingBox(),
            page.locator( READER_WORD_TOOLTIP ).boundingBox()
        ] )
        expect( word_box ).not.toBeNull()
        expect( tooltip_box ).not.toBeNull()
        expect( tooltip_box.y + tooltip_box.height ).toBeLessThanOrEqual( word_box.y + 1 )
        expect( tooltip_box.x ).toBeGreaterThanOrEqual( 0 )
        expect( tooltip_box.x + tooltip_box.width ).toBeLessThanOrEqual( 390 )
        expect( calls.meaning ).toBe( 1 )
        expect( calls.explanation ).toBe( 0 )
        expect( calls.word_lookup ).toBe( 2 )

    } )

    test( `tapping another fragment replaces the sheet content`, async ( { page } ) => {

        const calls = await install_translation_mock( page )
        await open_reader( page )

        const sentences = page.locator( `span[data-sentence-id]` )
        await expect( page.locator( `[data-translation-word-index]` ).first() ).toBeVisible( { timeout: 15_000 } )
        const first_sentence = sentences.nth( 0 )
        const first_text = await first_sentence.textContent()
        const different_fragment_index = await sentences.evaluateAll( ( fragments, current_text ) =>
            fragments.findIndex( ( fragment, index ) =>
                index > 0
                && fragment.textContent !== current_text
                && fragment.querySelector( `[data-translation-word-index]` )
            ),
            first_text
        )
        expect( different_fragment_index ).toBeGreaterThan( 0 )

        const first_word = translation_words( first_sentence ).first()
        const second_fragment_word = translation_words( sentences.nth( different_fragment_index ) ).first()
        await expect( second_fragment_word ).toBeVisible( { timeout: 15_000 } )

        const sheet = page.locator( `[data-translation-info-sheet]` )

        await first_word.tap()
        await expect( sheet ).not.toHaveAttribute( `aria-busy`, `true` )
        const first_meaning = await sheet.textContent()

        await second_fragment_word.tap()

        await expect( sheet ).toHaveCount( 1 )
        await expect( second_fragment_word ).toHaveAttribute( `aria-pressed`, `true` )
        await expect( first_word ).toHaveAttribute( `aria-pressed`, `false` )
        await expect.poll( () => sheet.textContent() ).not.toBe( first_meaning )
        expect( calls.meaning ).toBeGreaterThanOrEqual( 2 )
        expect( calls.word_lookup ).toBeGreaterThanOrEqual( 2 )

    } )

    test( `outside taps preserve the sheet and the explicit close clears selection`, async ( { page } ) => {

        await install_translation_mock( page )
        await open_reader( page )

        const word = page.locator( `[data-translation-word-index]` ).first()
        const sheet = page.locator( `[data-translation-info-sheet]` )
        await expect( word ).toBeVisible( { timeout: 15_000 } )

        await word.tap()
        await expect( sheet ).toBeVisible()
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toBeVisible()

        await page.locator( `main` ).tap( { position: { x: 195, y: 4 } } )
        await expect( sheet ).toBeVisible()
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toBeVisible()

        await sheet.getByRole( `button`, { name: `Close translation information` } ).tap()
        await expect( sheet ).not.toBeVisible()
        await expect( page.locator( READER_WORD_TOOLTIP ) ).not.toBeVisible()
        await expect( word ).toHaveAttribute( `aria-pressed`, `false` )

    } )

    test( `Explain opens the retained sentence explanation modal`, async ( { page } ) => {

        const calls = await install_translation_mock( page )
        await open_reader( page )

        const word = page.locator( `[data-translation-word-index]` ).first()
        const sheet = page.locator( `[data-translation-info-sheet]` )
        await expect( word ).toBeVisible( { timeout: 15_000 } )

        await word.tap()
        await expect( sheet ).toBeVisible()
        expect( calls.explanation ).toBe( 0 )

        await sheet.getByRole( `button`, { name: `Explain` } ).tap()

        const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
        await expect( dialog ).toBeVisible()
        await expect( dialog ).toContainText( `Original` )
        await expect( dialog ).toContainText( `Translation` )
        await expect( dialog ).toContainText( `Detailed explanation here.` )
        expect( calls.explanation ).toBeGreaterThanOrEqual( 1 )
        expect( calls.word_lookup ).toBe( 1 )

    } )

    test( `sheet stays above the footer and inside a narrow mobile viewport`, async ( { page } ) => {

        await page.setViewportSize( { width: 320, height: 568 } )
        await install_translation_mock( page )
        await open_reader( page )

        const word = page.locator( `[data-translation-word-index]` ).first()
        await expect( word ).toBeVisible( { timeout: 15_000 } )
        await word.tap()

        const sheet = page.locator( `[data-translation-info-sheet]` )
        const footer = page.locator( `footer` )
        const close_button = sheet.getByRole( `button`, { name: `Close translation information` } )
        const explain_button = sheet.getByRole( `button`, { name: `Explain` } )

        await expect( sheet ).toBeVisible()
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toBeVisible()
        await expect( footer ).toBeVisible()
        await expect( page.getByRole( `button`, { name: /next/i } ) ).toBeVisible()

        const [ sheet_box, footer_box, close_box, explain_box ] = await Promise.all( [
            sheet.boundingBox(),
            footer.boundingBox(),
            close_button.boundingBox(),
            explain_button.boundingBox()
        ] )

        expect( sheet_box ).not.toBeNull()
        expect( footer_box ).not.toBeNull()
        expect( close_box ).not.toBeNull()
        expect( explain_box ).not.toBeNull()
        expect( sheet_box.x ).toBeGreaterThanOrEqual( 0 )
        expect( sheet_box.x + sheet_box.width ).toBeLessThanOrEqual( 320 )
        expect( sheet_box.y + sheet_box.height ).toBeLessThanOrEqual( footer_box.y + 1 )
        expect( close_box.x + close_box.width ).toBeLessThanOrEqual( 320 )
        expect( explain_box.x + explain_box.width ).toBeLessThanOrEqual( 320 )
        expect( explain_box.y + explain_box.height ).toBeLessThanOrEqual( 568 )

    } )

    test( `tooltip flips below a word near the top edge and hides when its word leaves view`, async ( { page } ) => {

        const long_translation = `A deliberately long contextual translation that needs several lines`
        await install_translation_mock( page, { word_lookup_content: long_translation } )
        await open_reader( page )

        const word = page.locator( `[data-translation-word-index]` ).first()
        const tooltip = page.locator( READER_WORD_TOOLTIP )
        const top_bar = page.locator( `header` ).first()
        await expect( word ).toBeVisible( { timeout: 15_000 } )

        await word.tap()
        await expect( tooltip ).toHaveText( long_translation )

        const top_bar_box = await top_bar.boundingBox()
        const viewport_height = page.viewportSize().height
        expect( top_bar_box ).not.toBeNull()
        await word.evaluate( ( element, visible_top ) => {
            window.scrollBy( 0, element.getBoundingClientRect().top - visible_top )
        }, top_bar_box.y + top_bar_box.height + 2 )

        await expect.poll( async () => {
            const [ word_box, tooltip_box ] = await Promise.all( [
                word.boundingBox(),
                tooltip.boundingBox()
            ] )
            if( !word_box || !tooltip_box ) return false
            return tooltip_box.y >= word_box.y + word_box.height
                && tooltip_box.y + tooltip_box.height <= viewport_height
        } ).toBe( true )

        await word.evaluate( element => {
            window.scrollBy( 0, element.getBoundingClientRect().bottom + 100 )
        } )

        await expect( tooltip ).not.toBeVisible()
        await expect( page.locator( `[data-translation-info-sheet]` ) ).toBeVisible()

    } )

    test( `dock resize hides an occluded tooltip and reveals it after the dock shrinks`, async ( { page } ) => {

        await install_translation_mock( page )
        await open_reader( page )

        const word = page.locator( `[data-translation-word-index]` ).first()
        const tooltip = page.locator( READER_WORD_TOOLTIP )
        const dock = page.locator( `[data-reader-dock]` )
        await expect( word ).toBeVisible( { timeout: 15_000 } )

        await word.tap()
        await expect( tooltip ).toBeVisible()

        await dock.evaluate( element => {
            element.style.position = `fixed`
            element.style.inset = `0`
        } )

        await expect.poll( () => word.evaluate( element => {
            const rect = element.getBoundingClientRect()
            const top_element = document.elementFromPoint(
                rect.left + rect.width / 2,
                rect.top + rect.height / 2
            )
            return !!top_element?.closest( `[data-reader-dock]` )
        } ) ).toBe( true )
        await expect( tooltip ).not.toBeVisible()

        await dock.evaluate( element => {
            element.style.position = ``
            element.style.inset = ``
        } )

        await expect( tooltip ).toBeVisible()

    } )

    test( `wrapped hyphenated words keep their tooltip anchored to a visible line`, async ( { page } ) => {

        const wrapped_word = `reader-friendly-context-sensitive-black-and-white-device-translation`
        await install_translation_mock( page, {
            translated_content: `Start ${ wrapped_word } finish`
        } )
        await open_reader( page )

        const word = page.locator( `[data-translation-word="${ wrapped_word }"]` ).first()
        const tooltip = page.locator( READER_WORD_TOOLTIP )
        await expect( word ).toBeVisible( { timeout: 15_000 } )
        await expect.poll( () => word.evaluate( element => element.getClientRects().length ) ).toBeGreaterThan( 1 )

        const tap_point = await word.evaluate( element => {
            const rect = element.getClientRects()[0]
            return {
                x: rect.left + Math.min( 2, rect.width / 2 ),
                y: rect.top + rect.height / 2
            }
        } )
        await page.touchscreen.tap( tap_point.x, tap_point.y )

        await expect( tooltip ).toBeVisible()
        const [ first_word_rect, tooltip_box ] = await Promise.all( [
            word.evaluate( element => {
                const rect = element.getClientRects()[0]
                return { top: rect.top, bottom: rect.bottom }
            } ),
            tooltip.boundingBox()
        ] )
        expect( tooltip_box ).not.toBeNull()
        expect(
            tooltip_box.y + tooltip_box.height <= first_word_rect.top + 1
            || tooltip_box.y >= first_word_rect.bottom - 1
        ).toBe( true )

    } )

    test( `empty word lookup responses settle as unavailable`, async ( { page } ) => {

        const calls = await install_translation_mock( page, { word_lookup_content: `   ` } )
        await open_reader( page )

        const word = page.locator( `[data-translation-word-index]` ).first()
        const tooltip = page.locator( READER_WORD_TOOLTIP )
        await expect( word ).toBeVisible( { timeout: 15_000 } )

        await word.tap()

        await expect( tooltip ).toHaveText( `Translation unavailable` )
        await expect( tooltip ).not.toHaveAttribute( `aria-live` )
        expect( calls.word_lookup ).toBe( 1 )

    } )

} )
