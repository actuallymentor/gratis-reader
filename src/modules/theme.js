// Resolves the stored theme choice to the theme the page renders. "system" follows the
// device and keeps following it when the device switches between light and dark.

export const THEMES = [ `system`, `light`, `dark`, `sepia` ]

const dark_query = () => typeof window !== `undefined` && window.matchMedia ? window.matchMedia( `(prefers-color-scheme: dark)` ) : null

/**
 * The concrete theme for a stored choice
 * @param {string} choice - One of THEMES
 * @returns {'light'|'dark'|'sepia'}
 */
export const resolve_theme = ( choice ) => {
    if( choice === `light` || choice === `dark` || choice === `sepia` ) return choice
    return dark_query()?.matches ? `dark` : `light`
}

let stop_following = null

/**
 * Applies a theme choice to the document and, for "system", tracks device changes
 * @param {string} choice
 */
export const apply_theme = ( choice ) => {
    document.documentElement.setAttribute( `data-theme`, resolve_theme( choice ) )

    stop_following?.()
    stop_following = null
    if( resolve_theme( choice ) !== choice ) {
        const query = dark_query()
        if( !query ) return
        const follow = () => document.documentElement.setAttribute( `data-theme`, resolve_theme( `system` ) )
        query.addEventListener( `change`, follow )
        stop_following = () => query.removeEventListener( `change`, follow )
    }
}
