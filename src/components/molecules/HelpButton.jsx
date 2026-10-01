import { useRef, useState } from 'react'
import styled from 'styled-components'
import { Info } from 'lucide-react'
import Modal from '../atoms/Modal.jsx'
import { Button, IconButton } from '../atoms/Button.jsx'

const Prose = styled.div`
    line-height: 1.6;

    p + p { margin-top: var(--space-s); }
`

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-l);
`

const SmallIcon = styled( IconButton )`
    svg { width: 1rem; height: 1rem; }
`

/**
 * Outlined "i" at the right of a label row, opening a centred help modal
 * @param {Object} props
 * @param {string} props.title - Descriptive heading of the help modal
 * @param {string} props.topic - Short name for the accessible label, e.g. "Turbo Mode"
 * @param {React.ReactNode} props.children - Help prose
 */
export default function HelpButton( { title, topic, children } ) {

    const [ open, set_open ] = useState( false )
    // A ref, not state: the modal hands over its close function on every render
    const close_ref = useRef( null )

    return <>
        <SmallIcon label={ `About ${ topic }` } icon={ <Info strokeWidth={ 1.5 } /> } onClick={ () => set_open( true ) } />
        { open && <Modal title={ title } width="30rem" close_ref={ fn => {
            close_ref.current = fn
        } } on_close={ () => set_open( false ) }
        >
            <Prose>{ children }</Prose>
            <Footer>
                <Button variant="primary" data-autofocus onClick={ () => close_ref.current?.() }>Got it</Button>
            </Footer>
        </Modal> }
    </>

}
