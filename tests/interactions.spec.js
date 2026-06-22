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

    test( `vocabulary panel lists common translated words for the viewport height`, async ( { page } ) => {

        await page.setViewportSize( { width: 1280, height: 900 } )

        const translated_sentence = `猫が猫を見た。犬が走る。猫は寝る。 alpha alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau`

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const word_match = user_msg.match( /Word:\s*(.+)$/ )

            if( word_match ) {
                const word = word_match[1].trim()

                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `source:${ word }` } } ]
                    } )
                } )
                return
            }

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: translated_sentence } } ],
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

        await page.setViewportSize( { width: 1280, height: 500 } )
        await expect( page.getByText( /alpha alpha beta/ ).first() ).toBeVisible( { timeout: 15_000 } )

        const panel = page.locator( `#reader-vocabulary-panel` )
        await expect( panel ).toHaveAttribute( `aria-hidden`, `true` )
        await expect( panel ).toHaveAttribute( `inert`, `` )

        await page.getByRole( `button`, { name: `Expand vocabulary list` } ).click()

        const rows = page.locator( `[data-reader-vocabulary-row]` )
        await expect.poll( () => rows.count() ).toBe( 7 )
        await expect( panel ).toHaveAttribute( `aria-hidden`, `false` )
        await expect( panel ).not.toHaveAttribute( `inert`, `` )
        await expect( rows.first() ).toContainText( /猫 - source:猫 \(\d+x\)/, { timeout: 5000 } )

        await page.setViewportSize( { width: 1280, height: 900 } )

        await expect.poll( () => rows.count() ).toBe( 18 )
        await page.getByRole( `button`, { name: `Collapse vocabulary list` } ).click()
        await expect( page.getByRole( `button`, { name: `Expand vocabulary list` } ) ).toBeVisible()
        await expect( panel ).toHaveAttribute( `aria-hidden`, `true` )
        await expect( panel ).toHaveAttribute( `inert`, `` )

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

    test( `long press toggles source-language meaning and Explain opens the modal`, async ( { page } ) => {

        const adapted_sentence = `Big work. Smart way.`
        const source_meaning = `The simplified sentence says to work in a smart way.`
        let meaning_prompt = ``

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const is_explanation = user_msg.includes( `Explain this translation` )
            const is_word_lookup = user_msg.includes( `Word:` )
            const is_sentence_meaning = user_msg.includes( `Adapted translation:` )

            let content
            if( is_explanation ) {
                content = `Detailed explanation here.`
            } else if( is_word_lookup ) {
                content = `[WORD] definition of the word`
            } else if( is_sentence_meaning ) {
                meaning_prompt = user_msg
                await new Promise( resolve => setTimeout( resolve, 1000 ) )
                content = source_meaning
            } else {
                await new Promise( resolve => setTimeout( resolve, 250 ) )
                content = adapted_sentence
            }

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content } } ],
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

        // Capture the visible original before the debounced translation request replaces it.
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( sentence ).toBeVisible( { timeout: 10_000 } )
        const original_sentence = await sentence.textContent() || ``

        expect( original_sentence ).not.toBe( `` )
        await expect( sentence ).toContainText( adapted_sentence )

        await long_press( page, sentence )

        await expect( sentence ).toHaveAttribute( `data-meaning-pending`, `true` )
        await expect( sentence ).toContainText( adapted_sentence )
        await expect( sentence ).not.toContainText( `...` )
        await expect( sentence ).toContainText( source_meaning, { timeout: 5000 } )
        await expect( sentence ).not.toHaveAttribute( `data-meaning-pending`, `true` )
        expect( meaning_prompt ).toContain( adapted_sentence )
        expect( meaning_prompt ).not.toContain( original_sentence )
        await expect( sentence ).not.toContainText( adapted_sentence )
        expect( await sentence.textContent() ).not.toContain( original_sentence )
        await expect( sentence.getByRole( `button`, { name: `Explain` } ) ).toBeVisible()

        await long_press( page, sentence )

        await expect( sentence ).toContainText( adapted_sentence )
        await expect( sentence.getByRole( `button`, { name: `Explain` } ) ).not.toBeVisible()

        await long_press( page, sentence )
        await sentence.getByRole( `button`, { name: `Explain` } ).click()

        const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
        await expect( dialog ).toBeVisible( { timeout: 5000 } )
        expect( await dialog.textContent() ).toContain( original_sentence )

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

    test( `retranslate icon confirms before refreshing the sentence and explanation`, async ( { page } ) => {

        const attempts_by_sentence = {}

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const is_explanation = user_msg.includes( `Explain this translation` )
            const is_word_lookup = user_msg.includes( `Word:` )
            const is_sentence_meaning = user_msg.includes( `Adapted translation:` )

            if( is_explanation ) {
                const translation_match = user_msg.match( /Translation: "(.+?)"/s )
                const translation = translation_match ? translation_match[1] : `unknown`

                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `Explanation for ${ translation }.` } } ]
                    } )
                } )
                return
            }

            if( is_word_lookup ) {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `[WORD] definition of the word` } } ]
                    } )
                } )
                return
            }

            if( is_sentence_meaning ) {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `[MEANING] sentence meaning` } } ]
                    } )
                } )
                return
            }

            const sentence_match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = sentence_match ? sentence_match[1].trim() : `unknown`
            attempts_by_sentence[sentence] = ( attempts_by_sentence[sentence] || 0 ) + 1

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[TRANSLATED:${ attempts_by_sentence[sentence] }] ${ sentence }` } } ],
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
        await expect( sentence ).toContainText( `[TRANSLATED:1]`, { timeout: 15_000 } )

        await sentence.click( { button: `right` } )

        const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
        await expect( dialog ).toBeVisible( { timeout: 5000 } )
        await expect( dialog.getByText( /Explanation for \[TRANSLATED:1\]/ ).first() ).toBeVisible( { timeout: 5000 } )

        const retranslate_button = dialog.getByRole( `button`, { name: `Re-translate sentence` } )

        page.once( `dialog`, async confirm_dialog => {
            expect( confirm_dialog.message() ).toBe( `Do you want to re-translate this sentence?` )
            await confirm_dialog.dismiss()
        } )

        await retranslate_button.click()
        await page.waitForTimeout( 500 )

        await expect( sentence ).toContainText( `[TRANSLATED:1]` )
        await expect( sentence ).not.toContainText( `[TRANSLATED:2]` )

        page.once( `dialog`, async confirm_dialog => {
            expect( confirm_dialog.message() ).toBe( `Do you want to re-translate this sentence?` )
            await confirm_dialog.accept()
        } )

        await retranslate_button.click()

        await expect( sentence ).toContainText( `[TRANSLATED:2]`, { timeout: 10_000 } )
        await expect( dialog ).toContainText( `[TRANSLATED:2]`, { timeout: 10_000 } )
        await expect( dialog.getByText( /Explanation for \[TRANSLATED:2\]/ ).first() ).toBeVisible( { timeout: 10_000 } )

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

    test( `hovering a word does not trigger dictionary lookup`, async ( { page } ) => {

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
            await page.waitForTimeout( 500 )

            await expect( page.getByText( `Test definition for this word.` ).first() ).not.toBeVisible()
            expect( word_lookup_calls ).toBe( 0 )
        }

    } )

    test( `clicking a source-language meaning does not error`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await long_press( page, sentence )
        await expect( sentence ).toContainText( `[MEANING]`, { timeout: 5000 } )

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
