import { expect } from '@playwright/test'

/**
 * The reader's searchable chapter list (a combobox, formerly a <select>).
 * @param {import('@playwright/test').Page} page
 */
export const chapter_combobox = page => page.getByRole( `combobox`, { name: `Chapter` } )

/**
 * Opens the chapter list (if closed) and returns its options, in spine order.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<import('@playwright/test').Locator>}
 */
export const open_chapter_list = async page => {

    const combobox = chapter_combobox( page )
    if( await combobox.getAttribute( `aria-expanded` ) !== `true` ) await combobox.click()

    const options = page.getByRole( `listbox`, { name: `Chapter` } ).getByRole( `option` )
    await expect( options.first() ).toBeVisible()
    return options

}

/**
 * Chapter labels in spine order; leaves the list closed.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export const chapter_labels = async page => {

    const labels = await ( await open_chapter_list( page ) ).allTextContents()
    await chapter_combobox( page ).press( `Escape` )
    return labels

}

/**
 * Jumps to a chapter by spine index; negative indexes count from the end (-1 = last).
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 */
export const choose_chapter = async ( page, index ) => {

    const options = await open_chapter_list( page )
    const target = index < 0 ? options.nth( await options.count() + index ) : options.nth( index )
    await target.click()

}

/**
 * The footer's `"<n> / <total> · <p>%"` progress text.
 * @param {import('@playwright/test').Page} page
 */
export const progress_text = page => page.locator( `footer` ).getByText( /^\d+ \/ \d+ · \d+%$/ )

/**
 * Asserts the reader shows the chapter at spine `index` (replaces reading the old <select> value).
 * @param {import('@playwright/test').Page} page
 * @param {number} index
 */
export const expect_chapter = async ( page, index ) => {
    await expect( progress_text( page ) ).toHaveText( new RegExp( `^${ index + 1 } / ` ) )
}

/**
 * The target language combobox (first-open modal and settings); typing filters, Enter picks.
 * @param {import('@playwright/test').Page} page
 */
export const language_combobox = page => page.getByRole( `combobox`, { name: `Target language` } )
