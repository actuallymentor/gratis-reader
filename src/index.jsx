import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryParamProvider } from 'use-query-params'
import { ReactRouter6Adapter } from 'use-query-params/adapters/react-router-6'
import { Toaster } from 'react-hot-toast'

import App from './App.jsx'
import { apply_theme, THEMES } from './modules/theme.js'
import './fonts.css'
import './index.css'

// Apply the saved theme before the first render; "system" follows the device
let theme_choice = `system`
try {
    const saved_settings = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
    const saved_theme = saved_settings?.state?.theme
    // Settings saved before the System theme stored the old "light" default
    const legacy_default = saved_theme === `light` && ( saved_settings?.version ?? 0 ) < 2
    if( THEMES.includes( saved_theme ) && !legacy_default ) theme_choice = saved_theme
} catch { /* corrupt settings — use default */ }
apply_theme( theme_choice )

createRoot( document.getElementById( `root` ) ).render(
    <StrictMode>
        <BrowserRouter>
            <QueryParamProvider adapter={ ReactRouter6Adapter }>
                <App />
                <Toaster
                    position="bottom-center"
                    toastOptions={ {
                        style: {
                            borderRadius: `10px`,
                            background: `var(--bg-surface)`,
                            color: `var(--text)`,
                            border: `1px solid var(--border)`
                        }
                    } }
                />
            </QueryParamProvider>
        </BrowserRouter>
    </StrictMode>
)
