import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, mock_openrouter, clear_storage, long_press } from './helpers/setup.js'

const CHAT_URL = `**/openrouter.ai/api/v1/chat/completions`

test.describe( `Sentence Interactions`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    const enter_reader_with_translations = async ( page ) => {

        await mock_openrouter( page )
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        try {
            await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
            await start_btn.click()
        } catch { /* modal not shown */ }

        // Wait for translations to appear — mocked translations start with [TRANSLATED]
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

    }

    const use_word_lookup_mock = async ( page, delay_for_word = () => 0 ) => {

        const calls = {}

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const word_match = user_msg.match( /Word:\s*(.+)$/ )

            if( word_match ) {
                const word = word_match[1].trim()
                calls[word] = ( calls[word] || 0 ) + 1

                const delay_ms = delay_for_word( word )
                if( delay_ms ) await new Promise( resolve => setTimeout( resolve, delay_ms ) )

                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `definition:${ word }` } } ]
                    } )
                } )
                return
            }

            await route.fallback()
        } )

        return calls

    }

    test( `click on translated word opens original-word tooltip`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( sentence ).toContainText( `[TRANSLATED]` )
        await expect.poll( () => sentence.evaluate( el => el.children.length ) ).toBeGreaterThan( 1 )

        const word = sentence.locator( `[data-word-tooltip-word]` ).first()
        await word.click()

        await expect( page.getByText( `[WORD] definition of the word` ).first() ).toBeVisible( { timeout: 5000 } )
        await expect( sentence ).toContainText( `[TRANSLATED]` )

    } )

    test( `slow word lookup keeps tooltip open until content arrives`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        await use_word_lookup_mock( page, () => 2500 )

        const word = page.locator( `span[data-sentence-id] [data-word-tooltip-word]` ).nth( 1 )
        const word_text = await word.getAttribute( `data-word-tooltip-word` )

        await word.click()

        await expect( page.getByText( `definition:${ word_text }` ).first() ).toBeVisible( { timeout: 5000 } )

    } )

    test( `word tooltip stays open until the tooltip is tapped`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const word = page.locator( `span[data-sentence-id] [data-word-tooltip-word]` ).nth( 1 )
        await word.click()

        await expect( page.getByText( `[WORD] definition of the word` ).first() ).toBeVisible( { timeout: 5000 } )

        await page.mouse.click( 1000, 140 )

        await expect( page.getByText( `[WORD] definition of the word` ).first() ).toBeVisible()

        await page.getByText( `[WORD] definition of the word` ).first().click()

        await expect( page.getByText( `[WORD] definition of the word` ).first() ).not.toBeVisible()

    } )

    test( `parallel word lookups do not abort each other`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const word_spans = page.locator( `span[data-sentence-id] [data-word-tooltip-word]` )
        const first_word = word_spans.nth( 0 )
        const first_text = await first_word.getAttribute( `data-word-tooltip-word` )
        const second_index = await word_spans.evaluateAll( ( words, first ) =>
            words.findIndex( word => word.dataset.wordTooltipWord && word.dataset.wordTooltipWord !== first ),
            first_text
        )
        expect( second_index ).toBeGreaterThan( -1 )
        const second_word = word_spans.nth( second_index )
        const second_text = await second_word.getAttribute( `data-word-tooltip-word` )

        const calls = await use_word_lookup_mock( page, word => word === first_text ? 900 : 100 )

        await first_word.click()
        await second_word.click()

        await expect( page.getByText( `definition:${ second_text }` ).first() ).toBeVisible( { timeout: 2000 } )
        await page.waitForTimeout( 1100 )

        await expect( page.getByText( `definition:${ first_text }` ).first() ).toBeVisible( { timeout: 500 } )
        await expect( page.getByText( `definition:${ second_text }` ).first() ).toBeVisible()
        expect( calls[first_text] ).toBe( 1 )
        expect( calls[second_text] ).toBe( 1 )

    } )

    test( `numeric-only translated tokens are not clickable lookup words`, async ( { page } ) => {

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const is_word_lookup = user_msg.includes( `Word:` )

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: is_word_lookup ? `definition` : `[TRANSLATED] 123 alpha` } } ],
                    usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
                } )
            } )
        } )

        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        try {
            await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
            await start_btn.click()
        } catch { /* modal not shown */ }

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( sentence ).toContainText( `[TRANSLATED] 123 alpha`, { timeout: 15_000 } )
        await expect( sentence.locator( `[data-word-tooltip-word="123"]` ) ).toHaveCount( 0 )
        await expect( sentence.locator( `[data-word-tooltip-word="alpha"]` ).first() ).toBeVisible()

    } )

    test( `double click does not toggle sentence text`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( sentence ).toContainText( `[TRANSLATED]` )

        const word = sentence.locator( `[data-word-tooltip-word]` ).nth( 1 )
        await word.dblclick()
        await page.waitForTimeout( 300 )
        await expect( sentence ).toContainText( `[TRANSLATED]` )

        await sentence.dblclick()
        await page.waitForTimeout( 300 )
        await expect( sentence ).toContainText( `[TRANSLATED]` )

    } )

    test( `long press toggles original text and Explain opens the modal`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await long_press( page, sentence )

        await expect( sentence ).not.toContainText( `[TRANSLATED]` )
        await expect( sentence.getByRole( `button`, { name: `Explain` } ) ).toBeVisible()

        await long_press( page, sentence )

        await expect( sentence ).toContainText( `[TRANSLATED]` )
        await expect( sentence.getByRole( `button`, { name: `Explain` } ) ).not.toBeVisible()

        await long_press( page, sentence )
        await sentence.getByRole( `button`, { name: `Explain` } ).click()

        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )

    } )

    test( `right-click opens explanation popover`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        // Mock the explanation API call
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `Detailed explanation here.` } } ]
                } )
            } )
        } )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click( { button: `right` } )

        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )

    } )

    test( `popover closes on outside click`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `Some explanation.` } } ]
                } )
            } )
        } )

        // Open popover via right-click
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click( { button: `right` } )

        // Wait for popover (use heading role to avoid matching word "explanation" in book text)
        const popover = page.getByRole( `heading`, { name: `Translation Explanation` } )
        await expect( popover ).toBeVisible( { timeout: 5000 } )

        // Click outside (the overlay backdrop)
        await page.mouse.click( 10, 10 )
        await page.waitForTimeout( 500 )

        // Popover should be gone
        await expect( popover ).not.toBeVisible()

    } )

    test( `hovering a word opens original-word tooltip`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        // Track word lookup API calls
        let word_lookup_calls = 0
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const is_word_lookup = user_msg.includes( `Word:` )

            if( is_word_lookup ) word_lookup_calls++

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: is_word_lookup ? `Test definition for this word.` : `[TRANSLATED] continuing translation` } } ]
                } )
            } )
        } )

        const word_spans = page.locator( `span[data-sentence-id] [data-word-tooltip-word]` )
        const word_count = await word_spans.count()

        if( word_count > 0 ) {
            await word_spans.first().hover()

            await expect( page.getByText( `Test definition for this word.` ).first() ).toBeVisible( { timeout: 5000 } )
            expect( word_lookup_calls ).toBe( 1 )
        }

    } )

    test( `clicking an original sentence does not error`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await long_press( page, sentence )
        await expect( sentence ).not.toContainText( `[TRANSLATED]` )

        await sentence.click()
        await page.waitForTimeout( 300 )

        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()

    } )

    test( `modal translated words open original-word tooltips`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click( { button: `right` } )

        const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
        await expect( dialog ).toBeVisible( { timeout: 5000 } )

        const modal_word = dialog.locator( `[data-word-tooltip-word]` ).first()
        await modal_word.click()

        await expect( dialog.getByText( `[WORD] definition of the word` ).first() ).toBeVisible( { timeout: 5000 } )

    } )

    test( `modal explanation foreign words open original-word tooltips`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const word_text = await sentence.locator( `[data-word-tooltip-word]` ).nth( 1 ).getAttribute( `data-word-tooltip-word` )
        if( !word_text ) throw new Error( `Expected a translated word in the first sentence` )

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const is_explanation = user_msg.includes( `Explain this translation` )
            const is_word_lookup = user_msg.includes( `Word:` )

            if( is_explanation ) {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `This explanation repeats ${ word_text } inside the modal body.` } } ]
                    } )
                } )
                return
            }

            if( is_word_lookup ) {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `definition:modal:${ word_text }` } } ]
                    } )
                } )
                return
            }

            await route.fallback()
        } )

        await sentence.click( { button: `right` } )

        const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
        await expect( dialog ).toBeVisible( { timeout: 5000 } )

        const explanation_word = dialog.locator( `.foreign-word` ).filter( { hasText: word_text } ).first()
        await explanation_word.click()

        await expect( dialog.getByText( `definition:modal:${ word_text }` ).first() ).toBeVisible( { timeout: 5000 } )

        await dialog.getByText( `definition:modal:${ word_text }` ).first().click()

        await expect( dialog.getByText( `definition:modal:${ word_text }` ).first() ).not.toBeVisible()

    } )

    test( `modal explanation survives closing div text and supports keyboard lookup`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const word_text = await sentence.locator( `[data-word-tooltip-word]` ).nth( 1 ).getAttribute( `data-word-tooltip-word` )
        if( !word_text ) throw new Error( `Expected a translated word in the first sentence` )
        let word_lookup_calls = 0

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const is_explanation = user_msg.includes( `Explain this translation` )
            const is_word_lookup = user_msg.includes( `Word:` )

            if( is_explanation ) {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `Explanation before </div> ${ word_text } after the stray tag.` } } ]
                    } )
                } )
                return
            }

            if( is_word_lookup ) {
                word_lookup_calls += 1
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `definition:keyboard:${ word_text }` } } ]
                    } )
                } )
                return
            }

            await route.fallback()
        } )

        await sentence.click( { button: `right` } )

        const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
        await expect( dialog ).toBeVisible( { timeout: 5000 } )
        await expect( dialog.getByText( /Explanation before/ ).first() ).toBeVisible( { timeout: 5000 } )
        await expect( dialog.getByText( /after the stray tag/ ).first() ).toBeVisible()

        const explanation_word = dialog.getByRole( `button`, { name: `Look up ${ word_text }` } ).first()
        await explanation_word.press( `Enter` )

        await expect( dialog.getByText( `definition:keyboard:${ word_text }` ).first() ).toBeVisible( { timeout: 5000 } )
        await page.waitForTimeout( 600 )
        expect( word_lookup_calls ).toBeGreaterThanOrEqual( 1 )

    } )

} )
