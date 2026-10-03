import { useEffect, useId, useRef, useState } from 'react'
import styled from 'styled-components'
import { AlertTriangle, Check, KeyRound, Loader2, RotateCw } from 'lucide-react'
import { Button } from '../atoms/Button.jsx'
import use_attention, { ATTENTION_DELAY_MS } from '../../hooks/use_attention.js'
import Modal from '../atoms/Modal.jsx'
import StatusPill from '../atoms/StatusPill.jsx'
import { KEY_FORMAT_HINT, looks_like_api_key, validate_api_key } from '../../modules/open_router.js'


const Row = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-s);
    flex-wrap: wrap;
`

const KeyDisplay = styled.code`
    flex: 1;
    min-width: 8rem;
    font-size: 0.85rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`

const FieldLabelRow = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-s);
    margin-bottom: var(--space-xs);
    font-size: 0.9rem;
    font-weight: 500;
`

const KeyInput = styled.input`
    width: 100%;
    min-height: 2.5rem;
    padding: var(--space-s) var(--space-m);
    border: 1px solid ${ p => p.$invalid ? `var(--danger)` : `var(--border)` };
    border-radius: var(--radius-m);
    background: var(--field-bg);
    color: var(--text);
    font-family: monospace;
    font-size: 0.9rem;

    &:focus-visible { border-color: ${ p => p.$invalid ? `var(--danger)` : `var(--accent)` }; }
`

const FieldError = styled.p`
    display: flex;
    gap: var(--space-xs);
    margin-top: var(--space-s);
    padding: var(--space-s) var(--space-m);
    border-radius: var(--radius-m);
    background: var(--danger-tint);
    color: var(--danger);
    font-size: 0.85rem;
    line-height: 1.4;

    svg { width: 1rem; height: 1rem; flex-shrink: 0; margin-top: 0.1rem; }
`

const UnsavedBanner = styled.p`
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    margin-top: var(--space-m);
    padding: var(--space-s) var(--space-m);
    border-radius: var(--radius-m);
    background: var(--warning-tint);
    color: var(--warning-text);
    font-size: 0.85rem;

    svg { width: 1rem; height: 1rem; }
`

const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: var(--space-s);
    margin-top: var(--space-s);
`

// Stable width across Save / Saving…
const SaveButton = styled( Button )`
    min-width: 6.5rem;

    .spin { animation: spin 1s linear infinite; }
`

const ModalActions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: var(--space-s);
    margin-top: var(--space-l);
`

const mask = key => key ? `${ key.slice( 0, 6 ) }...${ key.slice( -4 ) }` : `Not set`

/**
 * API key setting with an explicit save lifecycle: Unsaved badge and banner while editing,
 * a sheen on the pending Save, a spinner while checking the key, an inline error for a
 * rejected key, and a modal that keeps the edit when the check cannot reach OpenRouter.
 * @param {Object} props
 * @param {string|null} props.api_key
 * @param {Function} props.on_save - Persists a validated key
 */
export default function ApiKeySetting( { api_key, on_save } ) {

    const [ editing, set_editing ] = useState( false )
    const [ draft, set_draft ] = useState( `` )
    const [ saving, set_saving ] = useState( false )
    const [ invalid, set_invalid ] = useState( null )
    const [ failed, set_failed ] = useState( false )
    const [ saved, set_saved ] = useState( false )
    const close_failed_ref = useRef( null )
    const retry_after_close_ref = useRef( false )
    const input_ref = useRef( null )
    const input_id = useId()
    const error_id = useId()

    const dirty = editing && draft.trim().length > 0

    // Sheen only on a pending save, after typing pauses; not while saving or hidden
    const attention = use_attention( dirty && !saving, draft )

    // Debounced shape check once typing pauses
    useEffect( () => {
        if( !editing ) return
        const timer = setTimeout( () => {
            if( draft.trim() && !looks_like_api_key( draft ) ) set_invalid( current => current || KEY_FORMAT_HINT )
            else set_invalid( current => current === KEY_FORMAT_HINT ? null : current )
        }, ATTENTION_DELAY_MS )
        return () => clearTimeout( timer )
    }, [ draft, editing ] )

    const start_edit = () => {
        set_saved( false )
        set_draft( `` )
        set_invalid( null )
        set_editing( true )
    }

    const stop_edit = () => {
        set_editing( false )
        set_draft( `` )
        set_invalid( null )
    }

    const save = async () => {
        const submitted = draft.trim()
        if( !submitted || saving ) return

        set_saving( true )
        set_invalid( null )
        try {
            const valid = await validate_api_key( submitted )
            if( !valid ) return set_invalid( `Invalid API key — please check and try again` )
            on_save( submitted )
            set_saved( true )
            stop_edit()
        } catch {
            set_failed( true )
        } finally {
            set_saving( false )
        }
    }

    if( !editing ) return <Row>
        <KeyDisplay>{ mask( api_key ) }</KeyDisplay>
        { saved && <StatusPill tone="info" icon={ <Check strokeWidth={ 1.5 } aria-hidden="true" /> } role="status">API key updated</StatusPill> }
        <Button icon={ <KeyRound strokeWidth={ 1.5 } /> } onClick={ start_edit }>Update Key</Button>
    </Row>

    return <div>
        <FieldLabelRow>
            <label htmlFor={ input_id }>New API key</label>
            { dirty && <StatusPill tone="warning">Unsaved</StatusPill> }
        </FieldLabelRow>
        <KeyInput
            ref={ input_ref }
            id={ input_id }
            type="text"
            value={ draft }
            placeholder="sk-or-..."
            $invalid={ !!invalid }
            aria-invalid={ !!invalid }
            aria-describedby={ invalid ? error_id : undefined }
            disabled={ saving }
            autoFocus
            onChange={ e => {
                set_draft( e.target.value )
                set_invalid( null )
            } }
            onKeyDown={ e => e.key === `Enter` && save() }
        />
        { invalid && <FieldError id={ error_id } role="alert">
            <AlertTriangle strokeWidth={ 1.5 } aria-hidden="true" />
            { invalid }
        </FieldError> }

        { dirty && <UnsavedBanner>
            <AlertTriangle strokeWidth={ 1.5 } aria-hidden="true" />
            This key is not saved yet.
        </UnsavedBanner> }
        <Actions>
            <Button onClick={ stop_edit } disabled={ saving }>{ dirty ? `Discard` : `Cancel` }</Button>
            <SaveButton
                variant="primary"
                attention={ attention }
                disabled={ !dirty || saving }
                icon={ saving ? <Loader2 className="spin" strokeWidth={ 1.5 } /> : null }
                onClick={ save }
            >
                { saving ? `Saving…` : `Save` }
            </SaveButton>
        </Actions>
        { saving && <span className="visually-hidden" role="status" aria-live="polite">Checking OpenRouter API key...</span> }

        { failed && <Modal
            title="Couldn't save the API key"
            width="28rem"
            close_ref={ fn => {
                close_failed_ref.current = fn
            } }
            on_close={ () => {
                set_failed( false )
                // Retry once the dialog is gone, so a quick second failure gets its own dialog
                if( retry_after_close_ref.current ) {
                    retry_after_close_ref.current = false
                    save()
                } else input_ref.current?.focus()
            } }
        >
            <p>OpenRouter could not be reached to check the key. Your edit is kept; check your internet connection and try again.</p>
            <ModalActions>
                <Button onClick={ () => close_failed_ref.current?.() }>Back to editing</Button>
                <Button variant="primary" data-autofocus icon={ <RotateCw strokeWidth={ 1.5 } /> } onClick={ () => {
                    retry_after_close_ref.current = true
                    close_failed_ref.current?.()
                } }
                >
                    Retry
                </Button>
            </ModalActions>
        </Modal> }
    </div>

}
