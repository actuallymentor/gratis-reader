import { useState, useEffect } from 'react'
import styled from 'styled-components'
import { use_settings_store } from '../../stores/settings_store.js'
import LanguagePicker from './LanguagePicker.jsx'
import LevelPicker from './LevelPicker.jsx'
import toast from 'react-hot-toast'
import { clear_translations } from '../../modules/cache.js'
import { validate_api_key } from '../../modules/open_router.js'

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 100;
    animation: fade_in 0.15s ease;

    @keyframes fade_in {
        from { opacity: 0; }
        to { opacity: 1; }
    }
`

const Drawer = styled.aside`
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    max-width: 380px;
    background: var(--bg-surface);
    border-left: 1px solid var(--border);
    padding: var(--space-xl);
    overflow-y: auto;
    z-index: 101;
    animation: slide_in 0.25s ease-out;

    @keyframes slide_in {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
    }

    @media (max-width: 480px) {
        max-width: 100%;
    }
`

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-xl);
`

const Title = styled.h2`
    font-size: 1.2em;
`

const CloseBtn = styled.button`
    background: none;
    border: none;
    font-size: 1.5em;
    color: var(--text-muted);
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-s);

    &:hover { background: var(--bg-hover); color: var(--text); }
`

const Section = styled.div`
    margin-bottom: var(--space-xl);
`

const Label = styled.label`
    display: block;
    font-size: 0.8em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    margin-bottom: var(--space-s);
`

const SliderRow = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-m);
`

const Slider = styled.input`
    flex: 1;
    accent-color: var(--accent);
`

const SliderValue = styled.span`
    font-size: 0.9em;
    min-width: 36px;
    text-align: right;
    color: var(--text);
`

const Select = styled.select`
    width: 100%;
    padding: var(--space-s) var(--space-m);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    background: var(--bg);
    color: var(--text);
    font-size: 0.95em;
`

const ThemeRow = styled.div`
    display: flex;
    gap: var(--space-s);
`

const ThemeBtn = styled.button`
    flex: 1;
    padding: var(--space-s) var(--space-m);
    border: 2px solid ${ p => p.$active ? `var(--accent)` : `var(--border)` };
    border-radius: var(--radius-s);
    background: ${ p => p.$active ? `var(--accent-light)` : `var(--bg)` };
    color: var(--text);
    font-size: 0.85em;
    min-height: 44px;
    transition: all 0.15s ease;

    &:hover { border-color: var(--accent); }
`

const DangerBtn = styled.button`
    width: 100%;
    padding: var(--space-s) var(--space-m);
    border: 1px solid #e53e3e;
    border-radius: var(--radius-s);
    background: transparent;
    color: #e53e3e;
    font-size: 0.85em;
    min-height: 44px;

    &:hover { background: rgba(229, 62, 62, 0.1); }
`

const KeyRow = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-s);
    margin-bottom: var(--space-s);
`

const KeyDisplay = styled.code`
    flex: 1;
    font-size: 0.85em;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`

const KeyInput = styled.input`
    flex: 1;
    padding: var(--space-s) var(--space-m);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    background: var(--bg);
    color: var(--text);
    font-size: 0.85em;
    font-family: monospace;
`

const SmallBtn = styled.button`
    padding: var(--space-xs) var(--space-s);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    background: var(--bg);
    color: var(--text);
    font-size: 0.8em;
    min-height: 44px;
    white-space: nowrap;

    &:hover:not(:disabled) { background: var(--bg-hover); }

    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`

const ValidationStatus = styled.p`
    color: var(--text-muted);
    font-size: 0.8em;
    margin-top: var(--space-xs);
`

const FONT_OPTIONS = [
    `Nunito`,
    `Georgia`,
    `Merriweather`,
    `system-ui`
]

/**
 * Settings drawer — slides in from the right
 * @param {Object} props
 * @param {boolean} props.is_open
 * @param {Function} props.on_close
 * @param {boolean} [props.show_language] - Whether to show language/level settings
 */
export default function SettingsDrawer( { is_open, on_close, show_language = true } ) {

    const {
        api_key, set_api_key,
        font_size, set_font_size,
        font_family, set_font_family,
        theme, set_theme,
        last_language, set_last_language,
        last_level, set_last_level,
        model, set_model,
        clear_api_key
    } = use_settings_store()

    const [ editing_key, set_editing_key ] = useState( false )
    const [ key_draft, set_key_draft ] = useState( `` )
    const [ validating_key, set_validating_key ] = useState( false )

    // Close on Escape
    useEffect( () => {
        if( !is_open ) return
        const handle_key = ( e ) => {
            if( e.key === `Escape` ) on_close()
        }
        window.addEventListener( `keydown`, handle_key )
        return () => window.removeEventListener( `keydown`, handle_key )
    }, [ is_open, on_close ] )

    if( !is_open ) return null

    const handle_clear_cache = async () => {
        if( window.confirm( `Clear all cached translations? This cannot be undone.` ) ) {
            await clear_translations()
            toast.success( `Translation cache cleared` )
        }
    }

    const handle_logout = () => {
        if( window.confirm( `Remove your API key? You'll need to enter it again.` ) ) {
            clear_api_key()
        }
    }

    const cancel_key_edit = () => {
        set_editing_key( false )
        set_key_draft( `` )
    }

    const save_key = async () => {

        const trimmed = key_draft.trim()
        if( !trimmed ) {
            toast.error( `Please enter an API key` )
            return
        }

        // Validate the key before saving it into persisted settings.
        set_validating_key( true )
        try {
            const valid = await validate_api_key( trimmed )
            if( valid ) {
                set_api_key( trimmed )
                toast.success( `API key updated` )
                cancel_key_edit()
            } else {
                toast.error( `Invalid API key — please check and try again` )
            }
        } catch {
            toast.error( `Could not connect — check your internet connection` )
        } finally {
            set_validating_key( false )
        }

    }

    return <>
        <Overlay onClick={ on_close } />
        <Drawer>

            <Header>
                <Title>Settings</Title>
                <CloseBtn onClick={ on_close } aria-label="Close">×</CloseBtn>
            </Header>

            { /* Language & Level */ }
            { show_language && <>
                <Section>
                    <Label>Target Language</Label>
                    <LanguagePicker value={ last_language } on_change={ set_last_language } />
                </Section>

                <Section>
                    <Label>Proficiency Level</Label>
                    <LevelPicker value={ last_level } on_change={ set_last_level } />
                </Section>
            </> }

            { /* Display Settings */ }
            <Section>
                <Label>Font Size</Label>
                <SliderRow>
                    <Slider
                        type="range"
                        min="12"
                        max="32"
                        value={ font_size }
                        onChange={ ( e ) => set_font_size( Number( e.target.value ) ) }
                    />
                    <SliderValue>{ font_size }px</SliderValue>
                </SliderRow>
            </Section>

            <Section>
                <Label>Font Family</Label>
                <Select value={ font_family } onChange={ ( e ) => set_font_family( e.target.value ) }>
                    { FONT_OPTIONS.map( font =>
                        <option key={ font } value={ font }>{ font }</option>
                    ) }
                </Select>
            </Section>

            <Section>
                <Label>Theme</Label>
                <ThemeRow>
                    { [ `light`, `dark`, `sepia` ].map( t =>
                        <ThemeBtn
                            key={ t }
                            $active={ theme === t }
                            onClick={ () => set_theme( t ) }
                        >
                            { t.charAt( 0 ).toUpperCase() + t.slice( 1 ) }
                        </ThemeBtn>
                    ) }
                </ThemeRow>
            </Section>

            { /* Model Selection */ }
            <Section>
                <Label>LLM Model</Label>
                <Select value={ model } onChange={ ( e ) => set_model( e.target.value ) }>
                    <option value="openai/gpt-4o-mini">GPT-4o Mini (fast, cheap)</option>
                    <option value="openai/gpt-4o">GPT-4o (better quality)</option>
                    <option value="anthropic/claude-sonnet-4-6">Claude Sonnet 4.6</option>
                    <option value="anthropic/claude-haiku-4-5-20251001">Claude Haiku 4.5 (fast)</option>
                    <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
                </Select>
            </Section>

            { /* Danger Zone */ }
            <Section>
                <Label>Cache</Label>
                <DangerBtn onClick={ handle_clear_cache }>
                    Clear Translation Cache
                </DangerBtn>
            </Section>

            <Section>
                <Label>API Key</Label>

                { /* Show masked key or edit input */ }
                { editing_key ? 
                    <KeyRow>
                        <KeyInput
                            type="text"
                            value={ key_draft }
                            onChange={ ( e ) => set_key_draft( e.target.value ) }
                            placeholder="sk-or-..."
                            disabled={ validating_key }
                            autoFocus
                        />
                        <SmallBtn
                            disabled={ validating_key }
                            onClick={ save_key }
                        >
                            { validating_key ? `Validating...` : `Save` }
                        </SmallBtn>
                        <SmallBtn
                            onClick={ cancel_key_edit }
                            disabled={ validating_key }
                        >
                            Cancel
                        </SmallBtn>
                    </KeyRow>
                    : 
                    <KeyRow>
                        <KeyDisplay>
                            { api_key ? `${ api_key.slice( 0, 6 ) }...${ api_key.slice( -4 ) }` : `Not set` }
                        </KeyDisplay>
                        <SmallBtn onClick={ () => {
                            set_key_draft( `` )
                            set_editing_key( true )
                        } }
                        >
                            Update
                        </SmallBtn>
                    </KeyRow> }

                { validating_key && <ValidationStatus role="status" aria-live="polite">
                    Checking OpenRouter API key...
                </ValidationStatus> }

                <DangerBtn onClick={ handle_logout }>
                    Remove API Key
                </DangerBtn>
            </Section>

        </Drawer>
    </>

}
