import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryParamProvider } from 'use-query-params'
import { ReactRouter6Adapter } from 'use-query-params/adapters/react-router-6'
import { Toaster } from 'react-hot-toast'

import App from './App.jsx'
import './index.css'

// Apply saved theme on load (wrapped in try-catch to handle corrupt localStorage)
const VALID_THEMES = [ `light`, `dark`, `sepia` ]
let theme = `light`
try {
    const saved_settings = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
    const saved_theme = saved_settings?.state?.theme
    if( VALID_THEMES.includes( saved_theme ) ) theme = saved_theme
} catch { /* corrupt settings — use default */ }
document.documentElement.setAttribute( `data-theme`, theme )

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
