import { useCallback, useId, useRef, useState } from 'react'
import styled from 'styled-components'
import Modal from '../atoms/Modal.jsx'
import { Button } from '../atoms/Button.jsx'

const Description = styled.div`
    color: var(--text-muted);
    line-height: 1.5;

    p + p { margin-top: var(--space-s); }
`

const Acknowledge = styled.label`
    display: flex;
    align-items: flex-start;
    gap: var(--space-s);
    margin-top: var(--space-l);
    padding: var(--space-s) var(--space-m);
    border-radius: var(--radius-m);
    background: var(--danger-tint);
    cursor: pointer;
    line-height: 1.4;

    input {
        width: 1.125rem;
        height: 1.125rem;
        margin-top: 0.15rem;
        accent-color: var(--accent);
        flex-shrink: 0;
    }
`

const Actions = styled.div`
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-s);
    margin-top: var(--space-l);
`

/**
 * Confirmation before a consequential action. Permanent deletions pass `acknowledgement`:
 * the confirm button stays disabled until the reader ticks it.
 * @param {Object} props
 * @param {string} props.title
 * @param {React.ReactNode} props.children - What will happen
 * @param {string} props.confirm_label
 * @param {string} [props.acknowledgement]
 * @param {boolean} [props.danger=true]
 * @param {Function} props.on_confirm
 * @param {Function} props.on_cancel
 */
export default function ConfirmModal( { title, children, confirm_label, acknowledgement, danger = true, on_confirm, on_cancel } ) {

    const [ acknowledged, set_acknowledged ] = useState( false )
    const close_ref = useRef( null )
    const confirmed_ref = useRef( false )
    const checkbox_id = useId()

    return <Modal
        title={ title }
        width="28rem"
        role="alertdialog"
        close_ref={ close => {
            close_ref.current = close
        } }
        on_close={ () => confirmed_ref.current ? on_confirm() : on_cancel() }
    >
        <Description>{ children }</Description>
        { acknowledgement && <Acknowledge htmlFor={ checkbox_id }>
            <input id={ checkbox_id } type="checkbox" checked={ acknowledged } onChange={ e => set_acknowledged( e.target.checked ) } />
            <span>{ acknowledgement }</span>
        </Acknowledge> }
        <Actions>
            <Button data-autofocus onClick={ () => close_ref.current?.() }>Cancel</Button>
            <Button
                variant={ danger ? `danger_solid` : `primary` }
                disabled={ !!acknowledgement && !acknowledged }
                onClick={ () => {
                    confirmed_ref.current = true
                    close_ref.current?.()
                } }
            >
                { confirm_label }
            </Button>
        </Actions>
    </Modal>

}

/**
 * Imperative confirmation: `const [ confirm_element, confirm ] = use_confirm()`, render the
 * element, then `if( await confirm( { title, body, confirm_label, acknowledgement } ) ) …`
 * @returns {[ React.ReactNode, Function ]}
 */
export const use_confirm = () => {

    const [ request, set_request ] = useState( null )

    const confirm = useCallback( options => new Promise( resolve => set_request( { ...options, resolve } ) ), [] )
    const settle = result => {
        request?.resolve( result )
        set_request( null )
    }

    const element = request && <ConfirmModal
        title={ request.title }
        confirm_label={ request.confirm_label }
        acknowledgement={ request.acknowledgement }
        danger={ request.danger ?? true }
        on_confirm={ () => settle( true ) }
        on_cancel={ () => settle( false ) }
    >
        { request.body }
    </ConfirmModal>

    return [ element, confirm ]

}
