import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Global app settings, persisted to localStorage
 */
export const use_settings_store = create(
    persist(
        ( set ) => ( {

            // API
            api_key: null,
            model: `openai/gpt-4o-mini`,

            // Display
            font_size: 18,
            font_family: `Nunito`,
            theme: `light`,

            // Language
            last_language: `Spanish`,
            last_level: `a2`,

            // Actions
            set_api_key: ( api_key ) => set( { api_key } ),
            set_model: ( model ) => set( { model } ),
            set_font_size: ( font_size ) => set( { font_size } ),
            set_font_family: ( font_family ) => set( { font_family } ),
            set_theme: ( theme ) => {
                document.documentElement.setAttribute( `data-theme`, theme )
                set( { theme } )
            },
            set_last_language: ( last_language ) => set( { last_language } ),
            set_last_level: ( last_level ) => set( { last_level } ),
            clear_api_key: () => set( { api_key: null } ),

        } ),
        {
            name: `settings-storage`,
            partialize: ( state ) => ( {
                api_key: state.api_key,
                model: state.model,
                font_size: state.font_size,
                font_family: state.font_family,
                theme: state.theme,
                last_language: state.last_language,
                last_level: state.last_level,
            } )
        }
    )
)
