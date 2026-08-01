import { test, expect } from '@playwright/test'
import {
    setup_api_key,
    upload_demo_book,
    open_reader,
    mock_openrouter,
    clear_storage
} from './helpers/setup.js'

const CHAT_URL = `**/openrouter.ai/api/v1/chat/completions`
const INFO_SHEET = `[data-translation-info-sheet]`
const READER_WORD = `span[data-sentence-id] [data-translation-word-index]`
const READER_WORD_TOOLTIP = `[data-reader-word-tooltip]`

const enter_reader_with_translations = async ( page ) => {
    await mock_openrouter( page )
    await open_reader( page )
    await expect( page.locator( READER_WORD ).first() ).toBeVisible( { timeout: 15_000 } )
}

const open_explanation = async ( page ) => {
    const word = page.locator( READER_WORD ).first()
    await word.click()

    const sheet = page.locator( INFO_SHEET )
    await expect( sheet ).toBeVisible()
    await sheet.getByRole( `button`, { name: `Explain` } ).click()

    const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
    await expect( dialog ).toBeVisible( { timeout: 5000 } )
    return dialog
}

test.describe( `Sentence Interactions`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    test( `click on a translated word opens its contextual tooltip and the simplified-fragment sheet`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        let word_lookup_calls = 0
        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``
            if( user_msg.includes( `Word:` ) ) word_lookup_calls += 1
            await route.fallback()
        } )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const word = sentence.locator( `[data-translation-word-index]` ).first()
        await word.click()

        const sheet = page.locator( INFO_SHEET )
        await expect( sheet ).toBeVisible()
        await expect( sheet ).toContainText( `[MEANING]`, { timeout: 5000 } )
        await expect( word ).toHaveAttribute( `aria-pressed`, `true` )
        await expect( word ).toHaveCSS( `text-decoration-line`, `none` )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText( `[WORD] definition of the word` )
        await expect( page.getByRole( `dialog`, { name: `Translation Explanation` } ) ).not.toBeVisible()
        expect( word_lookup_calls ).toBe( 1 )

    } )

    test( `failed meaning requests stop until the user makes a new selection`, async ( { page } ) => {

        let meaning_calls = 0

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``

            if( user_msg.includes( `Adapted translation:` ) ) {
                meaning_calls += 1
                await route.fulfill( { status: 500, body: `Meaning unavailable` } )
                return
            }

            const sentence_match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = sentence_match ? sentence_match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TRANSLATED] ${ sentence }` } } ] } )
            } )
        } )

        await open_reader( page )

        const word = page.locator( READER_WORD ).first()
        await expect( word ).toBeVisible( { timeout: 15_000 } )
        await word.click()

        await expect( page.locator( INFO_SHEET ) ).toContainText( `Meaning unavailable`, { timeout: 5000 } )
        await page.waitForTimeout( 1000 )
        expect( meaning_calls ).toBe( 1 )

    } )

    test( `cached meanings stay readable without another API request`, async ( { page } ) => {

        let meaning_calls = 0

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``

            if( user_msg.includes( `Adapted translation:` ) ) {
                meaning_calls += 1
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( {
                        choices: [ { message: { content: `Readable unaligned meaning.` } } ]
                    } )
                } )
                return
            }

            const sentence_match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = sentence_match ? sentence_match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TRANSLATED] ${ sentence }` } } ] } )
            } )
        } )

        await open_reader( page )

        const first_word = page.locator( READER_WORD ).first()
        await expect( first_word ).toBeVisible( { timeout: 15_000 } )
        await first_word.click()
        await expect( page.locator( INFO_SHEET ) ).toContainText( `Readable unaligned meaning.` )

        await page.getByLabel( `Back to library` ).click()
        await page.waitForURL( /\/library/ )
        await open_reader( page )

        await page.locator( READER_WORD ).first().click()
        await expect( page.locator( INFO_SHEET ) ).toContainText( `Readable unaligned meaning.` )
        expect( meaning_calls ).toBe( 1 )

    } )

    test( `same-fragment clicks move one tooltip without remounting the sheet`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const words = page.locator( `span[data-sentence-id]` ).first().locator( `[data-translation-word-index]` )
        const first_word = words.nth( 0 )
        const second_word = words.last()
        const sheet = page.locator( INFO_SHEET )

        await first_word.click()
        await expect( sheet ).toBeVisible()
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText( `[WORD] definition of the word` )
        const first_word_box = await first_word.boundingBox()
        await sheet.evaluate( element => { window.__desktop_translation_sheet = element } )

        await second_word.click()

        expect( await sheet.evaluate( element => element === window.__desktop_translation_sheet ) ).toBe( true )
        await expect( first_word ).toHaveAttribute( `aria-pressed`, `false` )
        await expect( second_word ).toHaveAttribute( `aria-pressed`, `true` )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveCount( 1 )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText( `[WORD] definition of the word` )

        const [ second_word_box, tooltip_box ] = await Promise.all( [
            second_word.boundingBox(),
            page.locator( READER_WORD_TOOLTIP ).boundingBox()
        ] )
        const horizontal_distance = ( first, second ) => Math.abs(
            first.x + first.width / 2 - ( second.x + second.width / 2 )
        )

        expect( first_word_box ).not.toBeNull()
        expect( second_word_box ).not.toBeNull()
        expect( tooltip_box ).not.toBeNull()
        expect( horizontal_distance( tooltip_box, second_word_box ) )
            .toBeLessThan( horizontal_distance( tooltip_box, first_word_box ) )

    } )

    test( `translated words support keyboard selection`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const word = page.locator( READER_WORD ).first()
        await word.focus()
        await word.press( `Enter` )

        await expect( page.locator( INFO_SHEET ) ).toBeVisible()
        await expect( word ).toHaveAttribute( `aria-pressed`, `true` )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText( `[WORD] definition of the word` )

    } )

    test( `numeric-only text stays plain while translated words remain selectable`, async ( { page } ) => {

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``
            const is_meaning = user_msg.includes( `Adapted translation:` )
            const word_match = user_msg.match( /Word:\s*(.+)$/ )
            const content = word_match
                ? `source:${ word_match[1].trim() }`
                : is_meaning
                    ? `Translated word`
                    : `Translated 123 alpha`

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content } } ],
                    usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
                } )
            } )
        } )

        await open_reader( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const word = sentence.locator( `[data-translation-word="alpha"]` )
        await expect( sentence ).toContainText( `Translated 123 alpha`, { timeout: 15_000 } )
        await expect( sentence.locator( `[data-translation-word="123"]` ) ).toHaveCount( 0 )
        await expect( word ).toBeVisible()
        await word.click()

        await expect( page.locator( INFO_SHEET ) ).toBeVisible()
        await expect( word ).toHaveAttribute( `aria-pressed`, `true` )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText( `source:alpha` )

    } )

    test( `vocabulary panel lists common translated words for the viewport height`, async ( { page } ) => {

        await page.setViewportSize( { width: 1280, height: 900 } )

        const translated_sentence = `猫が猫を見た。犬が走る。猫は寝る。 alpha alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau`

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``
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

        await open_reader( page )

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

    test( `double click leaves translated text visible and keeps one sheet`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const word = sentence.locator( `[data-translation-word-index]` ).nth( 1 )
        const translated_word_count = await sentence.locator( `[data-translation-word-index]` ).count()

        await word.dblclick()
        await expect( sentence.locator( `[data-translation-word-index]` ) ).toHaveCount( translated_word_count )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveCount( 1 )
        await expect( page.locator( INFO_SHEET ) ).toHaveCount( 1 )

    } )

    test( `sheet meaning stays separate from translated text and Explain opens the modal`, async ( { page } ) => {

        const adapted_sentence = `Big work. Smart way.`
        const source_meaning = `Big work. Smart path.`
        let meaning_prompt = ``
        let word_lookup_calls = 0

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``
            const is_explanation = user_msg.includes( `Explain this translation` )
            const is_word_lookup = user_msg.includes( `Word:` )
            const is_sentence_meaning = user_msg.includes( `Adapted translation:` )

            let content
            if( is_explanation ) {
                content = `Detailed explanation here.`
            } else if( is_word_lookup ) {
                word_lookup_calls += 1
                const word_match = user_msg.match( /Word:\s*(.+)$/ )
                content = `source:${ word_match ? word_match[1].trim() : `word` }`
            } else if( is_sentence_meaning ) {
                meaning_prompt = user_msg
                content = source_meaning
            } else {
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

        await open_reader( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const original_sentence = await sentence.textContent()
        await expect( sentence ).toContainText( adapted_sentence, { timeout: 15_000 } )

        await sentence.locator( `[data-translation-word-index="1"]` ).click()

        const sheet = page.locator( INFO_SHEET )
        await expect( sheet ).toContainText( source_meaning, { timeout: 5000 } )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText( `source:work` )
        await expect( sentence ).toContainText( adapted_sentence )
        expect( meaning_prompt ).toContain( adapted_sentence )
        expect( word_lookup_calls ).toBe( 1 )

        await sheet.getByRole( `button`, { name: `Explain` } ).click()

        const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
        await expect( dialog ).toBeVisible()
        expect( await dialog.textContent() ).toContain( original_sentence )

    } )

    test( `right click does not bypass the sheet Explain action`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click( { button: `right` } )
        await expect( page.getByRole( `dialog`, { name: `Translation Explanation` } ) ).not.toBeVisible()

        await sentence.locator( `[data-translation-word-index]` ).first().click()
        await page.locator( INFO_SHEET ).getByRole( `button`, { name: `Explain` } ).click()
        await expect( page.getByRole( `dialog`, { name: `Translation Explanation` } ) ).toBeVisible()

    } )

    test( `retranslate icon confirms before refreshing the sentence and explanation`, async ( { page } ) => {

        const attempts_by_sentence = {}

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``
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
                        choices: [ { message: { content: `Sentence meaning` } } ]
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

        await open_reader( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( sentence ).toContainText( `[TRANSLATED:1]`, { timeout: 15_000 } )

        await sentence.locator( `[data-translation-word-index]` ).first().click()
        await page.locator( INFO_SHEET ).getByRole( `button`, { name: `Explain` } ).click()

        const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
        await expect( dialog ).toBeVisible()
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

    test( `explanation popover closes on outside click`, async ( { page } ) => {

        await enter_reader_with_translations( page )
        const dialog = await open_explanation( page )

        await page.mouse.click( 10, 10 )
        await expect( dialog ).not.toBeVisible()

    } )

    test( `hovering a reader word does not trigger dictionary lookup`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        let word_lookup_calls = 0
        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``
            if( user_msg.includes( `Word:` ) ) word_lookup_calls += 1
            await route.fallback()
        } )

        await page.locator( READER_WORD ).first().hover()
        await page.waitForTimeout( 500 )

        expect( word_lookup_calls ).toBe( 0 )
        await expect( page.locator( INFO_SHEET ) ).not.toBeVisible()

    } )

    test( `clicking the simplified meaning does not dismiss the sheet`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        await page.locator( READER_WORD ).first().click()
        const sheet = page.locator( INFO_SHEET )
        await expect( sheet ).toContainText( `[MEANING]`, { timeout: 5000 } )

        await sheet.locator( `[data-translation-meaning]` ).click()
        await expect( sheet ).toBeVisible()
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toBeVisible()

    } )

    test( `modal translated words open original-word tooltips`, async ( { page } ) => {

        await enter_reader_with_translations( page )
        const dialog = await open_explanation( page )

        const modal_word = dialog.locator( `[data-word-tooltip-word]` ).first()
        await modal_word.click()

        await expect( dialog.getByText( `[WORD] definition of the word` ).first() ).toBeVisible( { timeout: 5000 } )

    } )

    test( `modal explanation foreign words open original-word tooltips`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const word_text = await page.locator( READER_WORD ).nth( 1 ).getAttribute( `data-translation-word` )
        if( !word_text ) throw new Error( `Expected a translated word in the first sentence` )

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``
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

        const dialog = await open_explanation( page )
        const explanation_word = dialog.locator( `.foreign-word` ).filter( { hasText: word_text } ).first()
        await explanation_word.click()

        await expect( dialog.getByText( `definition:modal:${ word_text }` ).first() ).toBeVisible( { timeout: 5000 } )
        await dialog.getByText( `definition:modal:${ word_text }` ).first().click()
        await expect( dialog.getByText( `definition:modal:${ word_text }` ).first() ).not.toBeVisible()

    } )

    test( `modal explanation survives closing div text and supports keyboard lookup`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const word_text = await page.locator( READER_WORD ).nth( 1 ).getAttribute( `data-translation-word` )
        if( !word_text ) throw new Error( `Expected a translated word in the first sentence` )
        let word_lookup_calls = 0

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``
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

        const dialog = await open_explanation( page )
        await expect( dialog.getByText( /Explanation before/ ).first() ).toBeVisible()
        await expect( dialog.getByText( /after the stray tag/ ).first() ).toBeVisible()

        const explanation_word = dialog.getByRole( `button`, { name: `Look up ${ word_text }` } ).first()
        await explanation_word.press( `Enter` )

        await expect( dialog.getByText( `definition:keyboard:${ word_text }` ).first() ).toBeVisible( { timeout: 5000 } )
        expect( word_lookup_calls ).toBeGreaterThanOrEqual( 1 )

    } )

} )
