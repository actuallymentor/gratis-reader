import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, clear_storage } from './helpers/setup.js'

const CHAT_URL = `**/openrouter.ai/api/v1/chat/completions`

const install_translation_mock = async ( page, { translated_sentence, source_meaning, calls } ) => {

    await page.route( CHAT_URL, async route => {
        const body = JSON.parse( route.request().postData() )
        const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
        const is_explanation = user_msg.includes( `Explain this translation` )
        const is_word_lookup = user_msg.includes( `Word:` )
        const is_sentence_meaning = user_msg.includes( `Adapted translation:` )

        let content = translated_sentence
        if( is_explanation ) {
            calls.explanation += 1
            content = `Detailed explanation here.`
        } else if( is_word_lookup ) {
            content = `[WORD] definition of the word`
        } else if( is_sentence_meaning ) {
            content = source_meaning
        }

        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                choices: [ { message: { content } } ],
                usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
            } )
        } )
    } )

}

const open_reader = async ( page ) => {

    await page.locator( `img[alt]` ).first().click()
    await page.waitForURL( /\/read\// )

    const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
    try {
        await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
        await start_btn.click()
    } catch { /* modal not shown — returning reader */ }

}

const dispatch_touch_context_menu_long_press = async ( locator ) => locator.evaluate( async el => {

    const rect = el.getBoundingClientRect()
    const x = rect.left + Math.min( 24, rect.width / 2 )
    const y = rect.top + rect.height - 4
    const touch = new Touch( { identifier: 1, target: el, clientX: x, clientY: y } )

    el.dispatchEvent( new TouchEvent( `touchstart`, {
        bubbles: true,
        cancelable: true,
        touches: [ touch ],
        targetTouches: [ touch ],
        changedTouches: [ touch ]
    } ) )

    await new Promise( resolve => setTimeout( resolve, 500 ) )

    const context_menu_event = new PointerEvent( `contextmenu`, {
        bubbles: true,
        cancelable: true,
        pointerType: `touch`,
        clientX: x,
        clientY: y,
        button: 0
    } )
    const context_menu_dispatch_result = el.dispatchEvent( context_menu_event )

    await new Promise( resolve => setTimeout( resolve, 250 ) )

    el.dispatchEvent( new TouchEvent( `touchend`, {
        bubbles: true,
        cancelable: true,
        changedTouches: [ touch ]
    } ) )

    return {
        context_menu_default_prevented: context_menu_event.defaultPrevented,
        context_menu_dispatch_result
    }

} )

const dispatch_cancelled_touch_context_menu_long_press = async ( locator ) => locator.evaluate( async el => {

    const rect = el.getBoundingClientRect()
    const x = rect.left + Math.min( 24, rect.width / 2 )
    const y = rect.top + rect.height - 4
    const touch = new Touch( { identifier: 1, target: el, clientX: x, clientY: y } )

    el.dispatchEvent( new TouchEvent( `touchstart`, {
        bubbles: true,
        cancelable: true,
        touches: [ touch ],
        targetTouches: [ touch ],
        changedTouches: [ touch ]
    } ) )

    await new Promise( resolve => setTimeout( resolve, 500 ) )

    const context_menu_event = new PointerEvent( `contextmenu`, {
        bubbles: true,
        cancelable: true,
        pointerType: `touch`,
        clientX: x,
        clientY: y,
        button: 0
    } )
    const context_menu_dispatch_result = el.dispatchEvent( context_menu_event )

    el.dispatchEvent( new TouchEvent( `touchcancel`, {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [ touch ]
    } ) )

    el.dispatchEvent( new TouchEvent( `touchend`, {
        bubbles: true,
        cancelable: true,
        changedTouches: [ touch ]
    } ) )

    await new Promise( resolve => setTimeout( resolve, 250 ) )

    return {
        context_menu_default_prevented: context_menu_event.defaultPrevented,
        context_menu_dispatch_result
    }

} )

test.describe( `Touch sentence interactions`, () => {

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

    test( `touch long press shows meaning and Explain without opening explanation dialog`, async ( { page } ) => {

        const translated_sentence = `Big work. Smart way.`
        const source_meaning = `The simplified sentence says to work in a smart way.`
        const calls = { explanation: 0 }

        await install_translation_mock( page, { translated_sentence, source_meaning, calls } )
        await open_reader( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( sentence ).toContainText( translated_sentence, { timeout: 15_000 } )

        const context_menu = await dispatch_touch_context_menu_long_press( sentence )

        expect( context_menu.context_menu_default_prevented ).toBe( true )
        expect( context_menu.context_menu_dispatch_result ).toBe( false )
        await expect( sentence ).toContainText( source_meaning, { timeout: 5000 } )
        await expect( sentence.getByRole( `button`, { name: `Explain` } ) ).toBeVisible()
        await expect( page.getByRole( `dialog`, { name: `Translation Explanation` } ) ).not.toBeVisible()
        expect( calls.explanation ).toBe( 0 )

        await sentence.getByRole( `button`, { name: `Explain` } ).tap()
        await expect( page.getByRole( `dialog`, { name: `Translation Explanation` } ) ).toBeVisible()
        expect( calls.explanation ).toBeGreaterThanOrEqual( 1 )

    } )

    test( `touch long press survives Android touch cancellation`, async ( { page } ) => {

        const translated_sentence = `Big work. Smart way.`
        const source_meaning = `The simplified sentence survives native touch cancellation.`
        const calls = { explanation: 0 }

        await install_translation_mock( page, { translated_sentence, source_meaning, calls } )
        await open_reader( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( sentence ).toContainText( translated_sentence, { timeout: 15_000 } )

        const context_menu = await dispatch_cancelled_touch_context_menu_long_press( sentence )

        expect( context_menu.context_menu_default_prevented ).toBe( true )
        expect( context_menu.context_menu_dispatch_result ).toBe( false )
        await expect( sentence ).toContainText( source_meaning, { timeout: 5000 } )
        await expect( sentence.getByRole( `button`, { name: `Explain` } ) ).toBeVisible()
        await expect( page.getByRole( `dialog`, { name: `Translation Explanation` } ) ).not.toBeVisible()
        expect( calls.explanation ).toBe( 0 )

    } )

} )
