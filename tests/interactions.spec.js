import { test, expect, open_seeded_reader } from './helpers/app_fixture.js'
import { mock_openrouter } from './helpers/setup.js'
import { CHAT_URL, parse_chat_request, fulfil_chat, answer_request } from './helpers/openrouter_mock.js'
import { confirm_in_modal } from './helpers/confirm_modal.js'

const INFO_SHEET = `[data-translation-info-sheet]`
const READER_WORD = `span[data-sentence-id] [data-translation-word-index]`
const READER_WORD_TOOLTIP = `[data-reader-word-tooltip]`
const WORD_KINDS = [ `word`, `word_batch` ]

const unique_translation_word_count = sentence => sentence
    .locator( `[data-translation-word]` )
    .evaluateAll( words => new Set(
        words.map( word => word.dataset.translationWord.toLowerCase() )
    ).size )

const enter_reader_with_translations = async ( page ) => {
    await mock_openrouter( page )
    await open_seeded_reader( page )
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

    test.use( { app_state: `reader` } )

    test( `click on a translated word opens its contextual tooltip and the word-by-word sheet`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        // Words of one sentence now share a batch request, so count words looked up rather than requests
        let word_lookup_calls = 0
        await page.route( CHAT_URL, async route => {
            const request = parse_chat_request( route.request().postDataJSON() )
            if( WORD_KINDS.includes( request.kind ) ) word_lookup_calls += request.words.length
            await route.fallback()
        } )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const word = sentence.locator( `[data-translation-word-index]` ).first()
        const expected_lookup_count = await unique_translation_word_count( sentence )
        await word.click()

        const sheet = page.locator( INFO_SHEET )
        const direct_word = sheet.locator( `[data-direct-translation-word-index="0"]` )
        await expect( sheet ).toBeVisible()
        await expect( sheet.getByRole( `heading`, { name: `Word by word` } ) ).toBeVisible()
        await expect( direct_word ).toContainText( `[WORD] definition of the word` )
        await expect( direct_word ).toContainText( `Selected word:` )
        await expect( direct_word ).toHaveCSS( `text-decoration-line`, `underline` )
        await expect( sheet.locator( `[data-word-by-word-translation]` ) ).toHaveAttribute( `aria-busy`, `false` )
        await expect( word ).toHaveAttribute( `aria-pressed`, `true` )
        await expect( word ).toHaveCSS( `text-decoration-line`, `underline` )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText( `[WORD] definition of the word` )
        await expect( page.getByRole( `dialog`, { name: `Translation Explanation` } ) ).not.toBeVisible()
        expect( word_lookup_calls ).toBe( expected_lookup_count )

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
        await sheet.evaluate( element => {
            window.__desktop_translation_sheet = element
        } )

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
            const request = parse_chat_request( route.request().postDataJSON() )
            const translated = () => `Translated 123 alpha`

            await fulfil_chat( route, answer_request( request, {
                sentence: translated,
                explanation: translated,
                meaning: translated,
                word: word => `source:${ word.trim() }`
            } ) )
        } )

        await open_seeded_reader( page )

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

    test( `word-by-word lookups preserve translated text and Explain opens the modal`, async ( { page } ) => {

        const adapted_sentence = `Big work. Smart way.`
        // Words of one sentence now share a batch request, so count words looked up rather than requests
        let word_lookup_calls = 0

        await page.route( CHAT_URL, async route => {
            const request = parse_chat_request( route.request().postDataJSON() )
            if( WORD_KINDS.includes( request.kind ) ) word_lookup_calls += request.words.length

            await fulfil_chat( route, answer_request( request, {
                sentence: () => adapted_sentence,
                meaning: () => adapted_sentence,
                explanation: () => `Detailed explanation here.`,
                word: word => `source:${ word.trim() }`
            } ) )
        } )

        await open_seeded_reader( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const original_sentence = await sentence.textContent()
        await expect( sentence ).toContainText( adapted_sentence, { timeout: 15_000 } )

        await sentence.locator( `[data-translation-word-index="1"]` ).click()

        const sheet = page.locator( INFO_SHEET )
        const direct_translation = sheet.locator( `[data-word-by-word-translation]` )
        const selected_direct_word = direct_translation.locator( `[data-direct-translation-word-index="1"]` )
        await expect( direct_translation ).toContainText( `source:Big` )
        await expect( direct_translation ).toContainText( `source:work` )
        await expect( direct_translation ).toContainText( `source:Smart` )
        await expect( direct_translation ).toContainText( `source:way` )
        await expect( selected_direct_word ).toContainText( `source:work` )
        await expect( selected_direct_word ).toHaveCSS( `text-decoration-line`, `underline` )
        await expect(
            direct_translation.locator( `[data-direct-translation-word-index="0"]` )
        ).toHaveCSS( `text-decoration-line`, `none` )
        await expect( direct_translation ).toHaveAttribute( `aria-busy`, `false` )
        await expect( page.locator( READER_WORD_TOOLTIP ) ).toHaveText( `source:work` )
        await expect( sentence ).toContainText( adapted_sentence )
        expect( word_lookup_calls ).toBe( 4 )

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
            const request = parse_chat_request( route.request().postDataJSON() )

            await fulfil_chat( route, answer_request( request, {
                explanation: ( { user } ) => {
                    const translation_match = user.match( /Translation: "(.+?)"/s )
                    return `Explanation for ${ translation_match ? translation_match[1] : `unknown` }.`
                },
                sentence: sentence => {
                    attempts_by_sentence[sentence] = ( attempts_by_sentence[sentence] || 0 ) + 1
                    return `[TRANSLATED:${ attempts_by_sentence[sentence] }] ${ sentence }`
                }
            } ) )
        } )

        await open_seeded_reader( page )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( sentence ).toContainText( `[TRANSLATED:1]`, { timeout: 15_000 } )

        await sentence.locator( `[data-translation-word-index]` ).first().click()
        await page.locator( INFO_SHEET ).getByRole( `button`, { name: `Explain` } ).click()

        const dialog = page.getByRole( `dialog`, { name: `Translation Explanation` } )
        await expect( dialog ).toBeVisible()
        await expect( dialog.getByText( /Explanation for \[TRANSLATED:1\]/ ).first() ).toBeVisible( { timeout: 5000 } )

        const retranslate_button = dialog.getByRole( `button`, { name: `Re-translate sentence` } )

        await confirm_in_modal( page, {
            title: `Do you want to re-translate this sentence?`,
            action: () => retranslate_button.click(),
            cancel: true
        } )

        await expect( sentence ).toContainText( `[TRANSLATED:1]` )
        await expect( sentence ).not.toContainText( `[TRANSLATED:2]` )

        await confirm_in_modal( page, {
            title: `Do you want to re-translate this sentence?`,
            action: () => retranslate_button.click()
        } )

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

        await page.clock.install()
        await enter_reader_with_translations( page )

        let word_lookup_calls = 0
        await page.route( CHAT_URL, async route => {
            const request = parse_chat_request( route.request().postDataJSON() )
            if( WORD_KINDS.includes( request.kind ) ) word_lookup_calls += 1
            await route.fallback()
        } )

        await page.locator( READER_WORD ).first().hover()
        await page.clock.runFor( 500 )

        expect( word_lookup_calls ).toBe( 0 )
        await expect( page.locator( INFO_SHEET ) ).not.toBeVisible()

    } )

    test( `clicking a word-by-word translation keeps the sheet open`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        await page.locator( READER_WORD ).first().click()
        const sheet = page.locator( INFO_SHEET )

        const direct_word = sheet.locator( `[data-direct-translation-word-index="0"]` )
        await direct_word.click()
        await expect( sheet ).toBeVisible()
        await expect( direct_word ).toHaveAttribute( `aria-pressed`, `true` )
        await expect( page.locator( READER_WORD ).first() ).toHaveAttribute( `aria-pressed`, `true` )

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
            const request = parse_chat_request( route.request().postDataJSON() )

            if( request.kind === `explanation` ) {
                await fulfil_chat( route, `This explanation repeats ${ word_text } inside the modal body.` )
                return
            }

            if( WORD_KINDS.includes( request.kind ) ) {
                await fulfil_chat( route, answer_request( request, { word: () => `definition:modal:${ word_text }` } ) )
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
            const request = parse_chat_request( route.request().postDataJSON() )

            if( request.kind === `explanation` ) {
                await fulfil_chat( route, `Explanation before </div> ${ word_text } after the stray tag.` )
                return
            }

            if( WORD_KINDS.includes( request.kind ) ) {
                word_lookup_calls += 1
                await fulfil_chat( route, answer_request( request, { word: () => `definition:keyboard:${ word_text }` } ) )
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
