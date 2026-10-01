import { expect } from '@playwright/test'

/**
 * Runs an action that opens the styled confirm modal, checks its title, then confirms
 * (ticking the acknowledgement checkbox when there is one) or cancels.
 * Resolves once the modal has animated out, i.e. after the app has acted on the answer.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {Function} options.action - Opens the modal, e.g. () => button.click()
 * @param {string|RegExp} options.title - Expected modal title (its accessible name)
 * @param {boolean} [options.cancel=false] - Click Cancel instead of confirming
 * @returns {Promise<import('@playwright/test').Locator>} The modal locator
 */
export const confirm_in_modal = async ( page, { action, title, cancel = false } ) => {

    await action()

    const modal = page.getByRole( `alertdialog` )
    await expect( modal ).toBeVisible()
    await expect( modal ).toHaveAccessibleName( title )

    if( cancel ) {
        await modal.getByRole( `button`, { name: `Cancel` } ).click()
    } else {

        // Permanent deletions keep the confirm button disabled until acknowledged
        const checkbox = modal.getByRole( `checkbox` )
        if( await checkbox.count() ) await checkbox.check()

        await modal.getByRole( `button` ).last().click()

    }

    await expect( modal ).toBeHidden()
    return modal

}
