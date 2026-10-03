import { test, expect, open_seeded_reader, SEEDED_READER_URL, SEEDED_BOOK_TITLE } from './helpers/app_fixture.js'
import { mock_openrouter } from './helpers/setup.js'
import {
    chapter_combobox,
    chapter_labels,
    choose_chapter,
    open_chapter_list,
    expect_chapter,
    progress_text,
    language_combobox
} from './helpers/reader.js'

const SENTENCE = `span[data-sentence-id]`

// Persisted progress for the (only) seeded book, -1 when nothing is saved
const get_saved_chapter_index = page => page.evaluate( () => new Promise( resolve => {
    const request = indexedDB.open( `gratis_reader` )
    request.onsuccess = () => {
        const get_all = request.result.transaction( `progress`, `readonly` ).objectStore( `progress` ).getAll()
        get_all.onsuccess = () => resolve( get_all.result[ 0 ]?.chapter_index ?? -1 )
        get_all.onerror = () => resolve( -1 )
    }
    request.onerror = () => resolve( -1 )
} ) )

const sentence_ids = page => page.locator( SENTENCE ).evaluateAll(
    elements => elements.map( element => element.dataset.sentenceId )
)

// Collects uncaught page errors; attach before the action under test
const collect_page_errors = page => {
    const errors = []
    page.on( `pageerror`, error => errors.push( error.message ) )
    return errors
}

test.describe( `Reader`, () => {

    test.use( { app_state: `reader` } )

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
    } )

    test( `renders chapter content with sentences`, async ( { page } ) => {

        await open_seeded_reader( page )

        // Should have sentence spans
        const sentences = page.locator( SENTENCE )
        const count = await sentences.count()
        expect( count ).toBeGreaterThan( 0 )

    } )

    test( `parsed chapter content is clean, safe plain text`, async ( { page } ) => {

        await open_seeded_reader( page )
        await expect( page.locator( SENTENCE ).first() ).toContainText( `[TRANSLATED]`, { timeout: 15_000 } )

        // Valid chapters never surface a load error
        await expect( page.getByText( `Failed to load chapter` ) ).toHaveCount( 0 )

        const sentences = await page.locator( SENTENCE ).evaluateAll(
            elements => elements.map( element => ( { text: element.textContent.trim(), html: element.innerHTML } ) )
        )
        expect( sentences.length ).toBeGreaterThan( 0 )

        for( const { text, html } of sentences ) {

            // Initials like "J.K." stay inside their sentence, translated or not
            expect( text ).not.toMatch( /^(\[TRANSLATED\] )?[A-Z]\.$/ )

            // Script and style bodies never leak into reading text
            expect( text ).not.toMatch( /\{[^}]*:[^}]*\}/ )
            expect( text ).not.toMatch( /function\s*\(/ )
            expect( text ).not.toMatch( /var\s+\w+\s*=/ )
            expect( text ).not.toMatch( /document\./ )

            // Book text renders as text, never as live markup
            expect( html ).not.toMatch( /<script/i )
            expect( html ).not.toMatch( /<iframe/i )
            expect( html ).not.toMatch( /onerror/i )

        }

    } )

    test( `sentence IDs are unique and encode hash, chapter, paragraph and index`, async ( { page } ) => {

        await open_seeded_reader( page )
        await expect.poll( () => page.locator( SENTENCE ).count() ).toBeGreaterThan( 1 )

        const id_format = /^[a-f0-9]+:\d+:\d+:\d+$/
        const first_chapter_ids = await sentence_ids( page )
        expect( new Set( first_chapter_ids ).size ).toBe( first_chapter_ids.length )
        for( const id of first_chapter_ids ) {
            expect( id ).toMatch( id_format )
            expect( id.split( `:` )[ 1 ] ).toBe( `0` )
        }

        // The chapter part follows the spine index into the next chapter
        await page.keyboard.press( `ArrowRight` )
        await expect( page.locator( SENTENCE ).first() ).not.toHaveAttribute( `data-sentence-id`, first_chapter_ids[ 0 ] )

        const second_chapter_ids = await sentence_ids( page )
        expect( second_chapter_ids.length ).toBeGreaterThan( 0 )
        for( const id of second_chapter_ids ) {
            expect( id ).toMatch( id_format )
            expect( id.split( `:` )[ 1 ] ).toBe( `1` )
        }

    } )

    test( `header shows the level badge and a top-right settings gear`, async ( { page } ) => {

        await open_seeded_reader( page )

        // Default level is A2 / Primary Schooler
        await expect( page.getByText( /A2.*Primary Schooler|Primary Schooler.*A2/ ) ).toBeVisible()

        const gear = page.getByRole( `button`, { name: `Settings` } )
        await expect( gear ).toBeVisible()
        const box = await gear.boundingBox()
        const viewport = page.viewportSize()
        expect( box.x + box.width / 2 ).toBeGreaterThan( viewport.width * 0.5 )
        expect( box.y ).toBeLessThan( viewport.height * 0.2 )

    } )

    test( `Next then Prev buttons return to the starting chapter`, async ( { page } ) => {

        const errors = collect_page_errors( page )
        await open_seeded_reader( page )

        // Track sentence IDs, not text: translations land asynchronously
        const first_sentence = page.locator( SENTENCE ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

        await page.getByRole( `button`, { name: /Next/ } ).click()
        await expect_chapter( page, 1 )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

        await page.getByRole( `button`, { name: /Prev/ } ).click()
        await expect_chapter( page, 0 )
        await expect( first_sentence ).toHaveAttribute( `data-sentence-id`, first_id )
        expect( errors ).toEqual( [] )

    } )

    test( `navigates chapters via keyboard arrows`, async ( { page } ) => {

        await open_seeded_reader( page )

        // Get the first sentence ID to track position
        const first_sentence = page.locator( SENTENCE ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

        // Press ArrowRight to go to next chapter; the footer follows ("2 / N")
        await page.keyboard.press( `ArrowRight` )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )
        await expect_chapter( page, 1 )

        // Press ArrowLeft to go back
        await page.keyboard.press( `ArrowLeft` )
        await expect( first_sentence ).toHaveAttribute( `data-sentence-id`, first_id )
        await expect_chapter( page, 0 )

    } )

    test( `first chapter: Prev is disabled and ArrowLeft does not move`, async ( { page } ) => {

        await open_seeded_reader( page )

        await expect_chapter( page, 0 )
        await expect( page.getByRole( `button`, { name: /Prev/ } ) ).toBeDisabled()

        // ArrowLeft is a no-op; the following ArrowRight is the barrier that proves it
        // was processed (a wrap or negative index would not land on chapter 2)
        await page.keyboard.press( `ArrowLeft` )
        await page.keyboard.press( `ArrowRight` )
        await expect_chapter( page, 1 )

    } )

    test( `last chapter: Next is disabled and ArrowRight does not move`, async ( { page } ) => {

        const errors = collect_page_errors( page )
        await open_seeded_reader( page )

        const last_index = ( await chapter_labels( page ) ).length - 1
        const first_sentence = page.locator( SENTENCE ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

        // Jump straight to the end via the TOC; read-ahead has nothing left to fetch
        await choose_chapter( page, last_index )
        await expect_chapter( page, last_index )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )
        await expect( first_sentence ).toBeVisible()
        await expect( page.getByRole( `button`, { name: /Next/ } ) ).toBeDisabled()

        // ArrowRight clamps; ArrowLeft afterwards lands exactly one chapter back
        await page.keyboard.press( `ArrowRight` )
        await page.keyboard.press( `ArrowLeft` )
        await expect_chapter( page, last_index - 1 )
        expect( errors ).toEqual( [] )

    } )

    test( `rapid arrow bursts land on the exact chapter without page errors`, async ( { page } ) => {

        const errors = collect_page_errors( page )
        await open_seeded_reader( page )
        await expect( chapter_combobox( page ) ).toBeVisible()

        // Send each burst without waiting on intermediate UI
        for( let i = 0; i < 5; i++ ) await page.keyboard.press( `ArrowRight` )
        await expect_chapter( page, 5 )

        for( let i = 0; i < 5; i++ ) await page.keyboard.press( `ArrowLeft` )
        await expect_chapter( page, 0 )
        await expect( page.locator( SENTENCE ).first() ).toBeVisible()

        // Settings still opens straight after a burst, and every key was applied
        for( let i = 0; i < 3; i++ ) await page.keyboard.press( `ArrowRight` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByRole( `heading`, { name: `Settings` } ) ).toBeVisible()
        await expect_chapter( page, 3 )
        expect( errors ).toEqual( [] )

    } )

    test( `arrow keys are inert while settings is open and work again after it closes`, async ( { page } ) => {

        const errors = collect_page_errors( page )
        await open_seeded_reader( page )

        const settings_heading = page.getByRole( `heading`, { name: `Settings` } )
        const open_settings = async () => {
            await page.getByRole( `button`, { name: `Settings` } ).click()
            await expect( settings_heading ).toBeVisible()
        }

        // Closed with the drawer's Close button
        await open_settings()
        await page.keyboard.press( `ArrowRight` )
        await expect( settings_heading ).toBeVisible()
        await page.getByRole( `dialog`, { name: `Settings` } ).getByRole( `button`, { name: `Close` } ).click()
        await expect( settings_heading ).not.toBeVisible()
        await expect_chapter( page, 0 )

        // Focus returns to the reader: arrows navigate again
        await page.keyboard.press( `ArrowRight` )
        await expect_chapter( page, 1 )

        // Closed with Escape, which must not leave the reader either
        await open_settings()
        await page.keyboard.press( `ArrowRight` )
        await page.keyboard.press( `Escape` )
        await expect( settings_heading ).not.toBeVisible()
        await expect( page ).toHaveURL( /\/read\// )
        await expect_chapter( page, 1 )

        await page.keyboard.press( `ArrowRight` )
        await expect_chapter( page, 2 )
        expect( errors ).toEqual( [] )

    } )

    test( `shows a progress indicator`, async ( { page } ) => {

        await open_seeded_reader( page )

        // Should see progress text like "1 / X · Y%"
        const progress = page.locator( `text=/\\d+ \\/ \\d+ · \\d+%/` )
        await expect( progress ).toBeVisible()

    } )

    test( `back button returns to the library`, async ( { page } ) => {

        await open_seeded_reader( page )

        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library`, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )

    } )

    test( `Escape key returns to the library`, async ( { page } ) => {

        await open_seeded_reader( page )

        await page.keyboard.press( `Escape` )
        await page.waitForURL( `**/library`, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )

    } )

    test( `TOC lists named chapters and jumping shows the chosen label`, async ( { page } ) => {

        await open_seeded_reader( page )

        const first_sentence = page.locator( SENTENCE ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

        // Every TOC entry carries a readable label
        await expect( chapter_combobox( page ) ).toBeVisible()
        const labels = await chapter_labels( page )
        expect( labels.length ).toBeGreaterThan( 3 )
        for( const label of labels ) expect( label.trim() ).not.toBe( `` )

        // Select a later chapter
        const options = await open_chapter_list( page )
        await options.nth( 3 ).click()
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )
        await expect_chapter( page, 3 )
        await expect( chapter_combobox( page ) ).toHaveValue( labels[ 3 ] )

    } )

    test( `swipe left navigates to next chapter`, async ( { page } ) => {

        await open_seeded_reader( page )

        const first_sentence = page.locator( SENTENCE ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

        // Simulate swipe left via dispatching touch events directly in the browser
        const main = page.locator( `main` )
        const box = await main.boundingBox()

        await page.evaluate( ( { bx, bw, by, bh } ) => {
            const el = document.querySelector( `main` )
            const start_x = bx + bw * 0.8
            const end_x = bx + bw * 0.2
            const y = by + bh / 2

            el.dispatchEvent( new TouchEvent( `touchstart`, {
                bubbles: true,
                touches: [ new Touch( { identifier: 0, target: el, clientX: start_x, clientY: y } ) ]
            } ) )
            el.dispatchEvent( new TouchEvent( `touchmove`, {
                bubbles: true,
                touches: [ new Touch( { identifier: 0, target: el, clientX: end_x, clientY: y } ) ]
            } ) )
            el.dispatchEvent( new TouchEvent( `touchend`, {
                bubbles: true,
                changedTouches: [ new Touch( { identifier: 0, target: el, clientX: end_x, clientY: y } ) ]
            } ) )
        }, { bx: box.x, bw: box.width, by: box.y, bh: box.height } )

        // Swipe should navigate to next chapter — content changes
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

    } )

    test( `tap-edge navigation advances chapter when clicking empty area`, async ( { page } ) => {

        await open_seeded_reader( page )

        const first_sentence = page.locator( SENTENCE ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

        // Dispatch a click on the right edge of main, bypassing child element targeting.
        // In real usage, this fires when a user clicks in the padding zone outside text content.
        const main = page.locator( `main` )
        const box = await main.boundingBox()

        await page.evaluate( ( { bx, bw, by, bh } ) => {
            const main = document.querySelector( `main` )
            const x = bx + bw * 0.95
            const y = by + bh / 2
            // Dispatch click directly on main (simulating click on empty padding area)
            const event = new MouseEvent( `click`, {
                bubbles: true, clientX: x, clientY: y
            } )
            // Override target check — set the event target to main itself
            Object.defineProperty( event, `target`, { value: main } )
            main.dispatchEvent( event )
        }, { bx: box.x, bw: box.width, by: box.y, bh: box.height } )

        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

    } )

    test( `hard reload keeps the current chapter`, async ( { page } ) => {

        await open_seeded_reader( page )

        await page.keyboard.press( `ArrowRight` )
        await expect_chapter( page, 1 )
        const progress_before_reload = await progress_text( page ).textContent()

        // Reload only once the chapter is persisted, so the test cannot race the save
        await expect.poll( () => get_saved_chapter_index( page ) ).toBe( 1 )
        await page.reload()

        await expect( page.locator( SENTENCE ).first() ).toBeVisible( { timeout: 10_000 } )
        await expect( progress_text( page ) ).toHaveText( progress_before_reload )

    } )

    test( `restores reading progress for returning reader`, async ( { page } ) => {

        await open_seeded_reader( page )

        // Navigate to chapter 3
        const first_sentence = page.locator( SENTENCE ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )
        const second_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, second_id )

        const ch3_id = await first_sentence.getAttribute( `data-sentence-id` )
        const progress_at_ch3 = await progress_text( page ).textContent()

        // The chapter is persisted to IndexedDB
        await expect.poll( () => get_saved_chapter_index( page ) ).toBe( 2 )

        // Go back to library
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library` )

        // Re-open the book from its library card (seeded books have no cover image)
        await page.getByRole( `heading`, { name: SEEDED_BOOK_TITLE } ).click()
        await page.waitForURL( `**${ SEEDED_READER_URL }` )

        // Should NOT show language modal (returning reader), and lands on chapter 3
        await expect( first_sentence ).toHaveAttribute( `data-sentence-id`, ch3_id, { timeout: 10_000 } )
        await expect( page.getByText( `Choose Your Language` ) ).not.toBeVisible()
        await expect( progress_text( page ) ).toHaveText( progress_at_ch3 )

    } )

} )

test.describe( `First open`, () => {

    // Book saved without progress: the reader asks for language and level first
    test.use( { app_state: `book` } )

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await page.goto( SEEDED_READER_URL )
    } )

    test( `language modal is a real modal with language, levels and Start Reading`, async ( { page } ) => {

        const dialog = page.getByRole( `dialog`, { name: `Choose Your Language` } )
        await expect( dialog ).toBeVisible( { timeout: 10_000 } )

        // A native <dialog> opened with showModal() is implicitly aria-modal
        expect( await dialog.evaluate( element => element.matches( `:modal` ) ) ).toBe( true )

        await expect( dialog.getByText( `Target language`, { exact: true } ) ).toBeVisible()
        await expect( dialog.getByText( `Proficiency level`, { exact: true } ) ).toBeVisible()

        // Default language is a full name, not a code like "es"
        await expect( language_combobox( page ) ).toHaveValue( `Spanish` )

        // Every level shows its CEFR code with its friendly label; A2 is the default
        const levels = dialog.getByRole( `radiogroup`, { name: `Proficiency level` } ).getByRole( `radio` )
        const expected_levels = [
            [ `A0`, `Caveman` ],
            [ `A1`, `Toddler` ],
            [ `A2`, `Primary Schooler` ],
            [ `B1-B2`, `High Schooler` ],
            [ `C1-C2`, `Adult` ]
        ]
        await expect( levels ).toHaveCount( expected_levels.length )
        for( const [ index, [ cefr, label ] ] of expected_levels.entries() ) {
            await expect( levels.nth( index ) ).toContainText( cefr )
            await expect( levels.nth( index ) ).toContainText( label )
        }
        await expect( levels.nth( 2 ) ).toHaveAttribute( `aria-checked`, `true` )

        await expect( dialog.getByRole( `button`, { name: `Start Reading` } ) ).toBeVisible()

    } )

    test( `arrow keys are inert behind the modal; Start Reading opens chapter 1`, async ( { page } ) => {

        const dialog = page.getByRole( `dialog`, { name: `Choose Your Language` } )
        await expect( dialog ).toBeVisible( { timeout: 10_000 } )

        await page.keyboard.press( `ArrowRight` )
        await expect( dialog ).toBeVisible()

        // Reading starts where the book starts: the arrow press did not move a chapter
        await dialog.getByRole( `button`, { name: `Start Reading` } ).click()
        await expect( page.locator( SENTENCE ).first() ).toBeVisible( { timeout: 10_000 } )
        await expect_chapter( page, 0 )

    } )

} )

test.describe( `Reader health`, () => {

    test.use( { app_state: `reader` } )

    test( `reading a translated chapter logs no React warnings or page errors`, async ( { page } ) => {

        // Listeners go first so nothing logged during load is missed
        const warnings = []
        page.on( `console`, message => {
            if( message.type() === `warning` && message.text().includes( `React` ) ) warnings.push( message.text() )
        } )
        const errors = collect_page_errors( page )

        await mock_openrouter( page )
        await open_seeded_reader( page )
        await expect( page.locator( `${ SENTENCE } [data-translation-word-index]` ).first() ).toBeVisible( { timeout: 15_000 } )

        // Translation finished: the progress indicator is gone
        await expect( page.locator( `[aria-live="polite"]` ).filter( { hasText: /^Translating ·/ } ) ).toBeHidden( { timeout: 15_000 } )

        // Filter out known non-issues (e.g. React DevTools suggestions)
        const real_warnings = warnings.filter( warning => !warning.includes( `DevTools` ) && !warning.includes( `StrictMode` ) )
        expect( real_warnings ).toEqual( [] )
        expect( errors ).toEqual( [] )

    } )

} )
