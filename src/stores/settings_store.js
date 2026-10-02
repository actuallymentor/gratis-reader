import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { apply_theme } from '../modules/theme.js'

/**
 * Global app settings, persisted to localStorage
 */
export const use_settings_store = create(
    persist(
        ( set ) => ( {

            // API
            api_key: null,
            model: `openai/gpt-6-luna`,
            turbo_mode: false,

            // Display
            font_size: 18,
            font_family: `Nunito`,
            // Follows the device until the reader picks a theme
            theme: `system`,

            // Language
            last_language: `Spanish`,
            last_level: `a2`,

            // Actions
            set_api_key: ( api_key ) => set( { api_key } ),
            set_model: ( model ) => set( { model } ),
            set_turbo_mode: ( turbo_mode ) => set( { turbo_mode } ),
            set_font_size: ( font_size ) => set( { font_size } ),
            set_font_family: ( font_family ) => set( { font_family } ),
            set_theme: ( theme ) => {
                apply_theme( theme )
                set( { theme } )
            },
            set_last_language: ( last_language ) => set( { last_language } ),
            set_last_level: ( last_level ) => set( { last_level } ),
            clear_api_key: () => set( { api_key: null } ),

        } ),
        {
            name: `settings-storage`,
            version: 2,
            migrate: ( state ) => {
                // Repair retired/invalid IDs without resetting a reader's saved choice.
                const model_updates = {
                    'anthropic/claude-sonnet-4-6': `anthropic/claude-sonnet-4.6`,
                    'anthropic/claude-haiku-4-5-20251001': `anthropic/claude-haiku-4.5`,
                    'google/gemini-2.0-flash-001': `google/gemini-3.8-flash`,
                }

                // Keep a stored theme: "light" may be a deliberate choice. Only missing values follow the device.
                const theme = state.theme || `system`

                return { ...state, theme, model: model_updates[state.model] || state.model || `openai/gpt-6-luna` }
            },
            partialize: ( state ) => ( {
                api_key: state.api_key,
                model: state.model,
                turbo_mode: state.turbo_mode,
                font_size: state.font_size,
                font_family: state.font_family,
                theme: state.theme,
                last_language: state.last_language,
                last_level: state.last_level,
            } )
        }
    )
)
