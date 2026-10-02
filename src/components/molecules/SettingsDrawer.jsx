import { useState, useEffect, useRef } from 'react'
import styled from 'styled-components'
import { useShallow } from 'zustand/react/shallow'
import { Download, LogOut, Trash2 } from 'lucide-react'
import Modal from '../atoms/Modal.jsx'
import SwitchRow from '../atoms/SwitchRow.jsx'
import { Button } from '../atoms/Button.jsx'
import HelpButton from './HelpButton.jsx'
import ApiKeySetting from './ApiKeySetting.jsx'
import { use_confirm } from './ConfirmModal.jsx'
import { THEMES } from '../../modules/theme.js'
import { use_settings_store } from '../../stores/settings_store.js'
import LanguagePicker from './LanguagePicker.jsx'
import LevelPicker from './LevelPicker.jsx'
import toast from 'react-hot-toast'
import { clear_translations } from '../../modules/cache.js'
import { force_pwa_update } from '../../modules/pwa_update.js'

const Section = styled.section`
    margin-bottom: var(--space-l);
`

const LabelRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
    min-height: 2rem;
    margin-bottom: var(--space-xs);
`

const Label = styled.label`
    font-size: 0.9rem;
    font-weight: 500;
    color: var(--text);
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
    font-size: 0.9rem;
    min-width: 2.5rem;
    text-align: right;
    color: var(--text);
`

const Select = styled.select`
    width: 100%;
    min-height: 2.5rem;
    padding: var(--space-s) var(--space-m);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--field-bg);
    color: var(--text);
    font: inherit;
    font-size: 0.95rem;
`

// Segmented control: tinted selection, no dark rim
const Segmented = styled.div`
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 0.2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--field-bg);
`

const Segment = styled.button`
    min-height: 2rem;
    padding: 0 var(--space-s);
    border: none;
    border-radius: 999px;
    background: ${ p => p.$active ? `var(--accent-light)` : `transparent` };
    box-shadow: ${ p => p.$active ? `inset 0 0 0 1px var(--accent)` : `none` };
    color: ${ p => p.$active ? `var(--text)` : `var(--text-muted)` };
    font: inherit;
    font-size: 0.85rem;
    font-weight: ${ p => p.$active ? 600 : 400 };
    transition: background var(--duration-press) ease, color var(--duration-press) ease;

    &:hover { color: var(--text); }

    /* Its own selection shadow would otherwise replace the global focus halo */
    &:focus-visible { box-shadow: 0 0 0 5px var(--focus-halo); }
`

const HelpText = styled.p`
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.45;
    margin-top: var(--space-xs);
`

const ButtonRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-s);
`

const Divider = styled.hr`
    border: none;
    border-top: 1px solid var(--border);
    margin: var(--space-l) 0;
`

const TurboDialog = styled.dialog`
    width: calc(100% - 2rem);
    max-width: 26rem;
    margin: auto;
    padding: var(--space-l);
    border: 1px solid var(--border);
    border-radius: var(--radius-l);
    background: var(--bg-surface);
    color: var(--text);
    box-shadow: var(--shadow-l);

    &::backdrop { background: var(--overlay); }
    &[open] { animation: turbo-in 500ms var(--ease-out); }
    @keyframes turbo-in { from { opacity: 0; transform: translateY(8px); } }

    p { margin: var(--space-m) 0; color: var(--text-muted); line-height: 1.5; }
`

const TurboTitle = styled.h2`
    font-size: 1.5rem;
`

const VersionLine = styled.p`
    color: var(--text-muted);
    font-size: 0.75rem;
    margin-top: var(--space-l);
    text-align: center;
`

const FONT_OPTIONS = [
    `Nunito`,
    `Georgia`,
    `Merriweather`,
    `system-ui`
]

const FORCE_UPDATE_BUSY_RESET_MS = 2_000
const APP_VERSION = import.meta.env.VITE_COMMIT_HASH || `unknown`

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
        turbo_mode, set_turbo_mode,
        clear_api_key
    } = use_settings_store( useShallow( state => state ) )
    const [ confirm_element, confirm ] = use_confirm()

    const [ forcing_update, set_forcing_update ] = useState( false )
    const force_update_reset_timer_ref = useRef( null )
    const turbo_dialog_ref = useRef( null )

    useEffect( () => () => {
        if( force_update_reset_timer_ref.current ) clearTimeout( force_update_reset_timer_ref.current )
    }, [] )

    useEffect( () => {
        if( is_open ) return
        if( !force_update_reset_timer_ref.current ) return

        clearTimeout( force_update_reset_timer_ref.current )
        force_update_reset_timer_ref.current = null
        set_forcing_update( false )
    }, [ is_open ] )

    if( !is_open ) return null

    const handle_clear_cache = async () => {
        const confirmed = await confirm( {
            title: `Clear all cached translations?`,
            body: <>
                <p>Every saved sentence translation and word gloss is deleted from this device.</p>
                <p>Reading those pages again translates them again, which uses API credits.</p>
            </>,
            acknowledgement: `I understand cached translations are permanently deleted`,
            confirm_label: `Clear cache`
        } )
        if( !confirmed ) return
        await clear_translations()
        toast.success( `Translation cache cleared` )
    }

    const handle_logout = async () => {
        const confirmed = await confirm( {
            title: `Remove your API key?`,
            body: <p>You'll need to enter it again before books can be translated.</p>,
            confirm_label: `Remove API key`
        } )
        if( confirmed ) clear_api_key()
    }

    const handle_force_update = async () => {

        set_forcing_update( true )

        try {
            await force_pwa_update()
            toast.success( `Reloading latest app version...` )
            if( force_update_reset_timer_ref.current ) clearTimeout( force_update_reset_timer_ref.current )
            force_update_reset_timer_ref.current = setTimeout( () => {
                set_forcing_update( false )
                force_update_reset_timer_ref.current = null
            }, FORCE_UPDATE_BUSY_RESET_MS )
        } catch {
            toast.error( `Could not force app update` )
            set_forcing_update( false )
        }

    }

    return <Modal title="Settings" variant="drawer" on_close={ on_close }>

        { /* Language & Level */ }
        { show_language && <>
            <Section>
                <LabelRow><Label htmlFor="settings-language">Target language</Label></LabelRow>
                <LanguagePicker id="settings-language" value={ last_language } on_change={ set_last_language } />
            </Section>

            <Section>
                <LabelRow><Label as="span">Proficiency level</Label></LabelRow>
                <LevelPicker value={ last_level } on_change={ set_last_level } />
            </Section>
        </> }

        { /* Display Settings */ }
        <Section>
            <LabelRow><Label htmlFor="settings-font-size">Font size</Label></LabelRow>
            <SliderRow>
                <Slider
                    id="settings-font-size"
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
            <LabelRow><Label htmlFor="settings-font-family">Font family</Label></LabelRow>
            <Select id="settings-font-family" value={ font_family } onChange={ ( e ) => set_font_family( e.target.value ) }>
                { FONT_OPTIONS.map( font =>
                    <option key={ font } value={ font }>{ font }</option>
                ) }
            </Select>
        </Section>

        <Section>
            <LabelRow><Label as="span" id="settings-theme-label">Theme</Label></LabelRow>
            <Segmented role="group" aria-labelledby="settings-theme-label">
                { THEMES.map( t =>
                    <Segment
                        key={ t }
                        type="button"
                        $active={ theme === t }
                        aria-pressed={ theme === t }
                        onClick={ () => set_theme( t ) }
                    >
                        { t.charAt( 0 ).toUpperCase() + t.slice( 1 ) }
                    </Segment>
                ) }
            </Segmented>
            <HelpText>System follows your device's light or dark mode.</HelpText>
        </Section>

        <Divider />

        { /* Background Lookups */ }
        <Section>
            <LabelRow>
                <Label as="span" id="turbo-mode-label">Turbo Mode</Label>
                <HelpButton title="What Turbo Mode does" topic="Turbo Mode">
                    <p>Normally a word is looked up when you tap it. Turbo Mode looks up the words on screen, plus twice as many ahead, in the background, so tapped words show their meaning instantly.</p>
                    <p>It sends more requests, including for words you never tap, so it uses more API credits. Turning it on asks you to confirm.</p>
                </HelpButton>
            </LabelRow>
            <SwitchRow
                checked={ turbo_mode }
                labelledby="turbo-mode-label"
                describedby="turbo-mode-help"
                on_toggle={ () => {
                    if( turbo_mode ) set_turbo_mode( false )
                    else turbo_dialog_ref.current.showModal()
                } }
            >
                Preload visible words plus twice that word count ahead so word lookups are ready sooner. Uses extra API credits.
            </SwitchRow>
        </Section>

        { /* Model Selection */ }
        <Section>
            <LabelRow>
                <Label htmlFor="llm-model">LLM Model</Label>
                <HelpButton title="Choosing a translation model" topic="translation models">
                    <p>The model writes every translation and word gloss. GPT-6 Luna is the default: in our blinded comparison it translated Dutch and Kosovar Albanian best, at a fraction of a cent per page.</p>
                    <p>Changing the model only affects new translations; pages you already read stay cached.</p>
                </HelpButton>
            </LabelRow>
            <Select id="llm-model" value={ model } onChange={ ( e ) => set_model( e.target.value ) }>
                <option value="openai/gpt-6-luna">GPT-6 Luna (default)</option>
                <option value="google/gemini-3.8-flash">Gemini 3.8 Flash</option>
                <option value="anthropic/claude-sonnet-5.5">Claude Sonnet 5.5</option>
                <option value="openai/gpt-4o-mini">GPT-4o Mini (fast, cheap)</option>
                <option value="openai/gpt-4o">GPT-4o (better quality)</option>
                <option value="anthropic/claude-sonnet-4.6">Claude Sonnet 4.6</option>
                <option value="anthropic/claude-haiku-4.5">Claude Haiku 4.5 (fast)</option>
            </Select>
        </Section>

        <Section>
            <LabelRow><Label as="span">API key</Label></LabelRow>
            <ApiKeySetting api_key={ api_key } on_save={ set_api_key } />
        </Section>

        <Divider />

        <Section>
            <LabelRow><Label as="span">Maintenance</Label></LabelRow>
            <ButtonRow>
                <Button icon={ <Download strokeWidth={ 1.5 } /> } onClick={ handle_force_update } disabled={ forcing_update }>
                    { forcing_update ? `Forcing Update...` : `Force Update` }
                </Button>
                <Button variant="danger" icon={ <Trash2 strokeWidth={ 1.5 } /> } onClick={ handle_clear_cache }>
                    Clear Translation Cache
                </Button>
                <Button variant="danger" icon={ <LogOut strokeWidth={ 1.5 } /> } onClick={ handle_logout }>
                    Remove API Key
                </Button>
            </ButtonRow>
        </Section>

        <VersionLine>Version: { APP_VERSION }</VersionLine>

        { confirm_element }
        <TurboDialog
            ref={ turbo_dialog_ref }
            aria-labelledby="turbo-confirm-title"
            aria-describedby="turbo-confirm-description"
        >
            <TurboTitle id="turbo-confirm-title">Enable Turbo Mode?</TurboTitle>
            <p id="turbo-confirm-description">
                Turbo Mode costs more: it translates visible words plus twice that word count ahead in the background,
                including words you might never look up. This uses additional API credits.
            </p>
            <ButtonRow style={ { justifyContent: `flex-end` } }>
                <Button autoFocus onClick={ () => turbo_dialog_ref.current.close() }>Cancel</Button>
                <Button variant="primary" onClick={ () => {
                    set_turbo_mode( true )
                    turbo_dialog_ref.current.close()
                } }
                >Enable Turbo Mode</Button>
            </ButtonRow>
        </TurboDialog>
    </Modal>

}
