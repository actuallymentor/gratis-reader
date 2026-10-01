import { useEffect, useId, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import { ChevronDown } from 'lucide-react'

const Wrapper = styled.div`
    position: relative;
    width: 100%;
    min-width: 0;
`

const Input = styled.input`
    width: 100%;
    min-height: 2.5rem;
    padding: 0.4rem 2.25rem 0.4rem 0.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--field-bg);
    color: var(--text);
    font: inherit;
    font-size: 0.95rem;
    text-overflow: ellipsis;
    cursor: pointer;

    &:focus-visible, &[aria-expanded="true"] {
        border-color: var(--accent);
        cursor: text;
    }

    &::placeholder { color: var(--text-muted); }
`

const Toggle = styled.button`
    position: absolute;
    top: 50%;
    right: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    transform: translateY(-50%);
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);

    svg {
        width: 1rem;
        height: 1rem;
        transition: transform 200ms var(--ease-out);
        transform: rotate(${ p => p.$open ? `180deg` : `0deg` });
    }
`

const List = styled.ul`
    position: absolute;
    z-index: 60;
    top: calc(100% + 0.25rem);
    left: 0;
    right: 0;
    max-height: min(18rem, 50dvh);
    overflow-y: auto;
    padding: var(--space-xs);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--bg-surface);
    box-shadow: var(--shadow-m);
    list-style: none;
`

const Option = styled.li`
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius-s);
    color: var(--text);
    font-size: 0.95rem;
    line-height: 1.35;
    cursor: pointer;

    &[aria-selected="true"] { font-weight: 600; }
    &[data-active="true"] { background: var(--bg-hover); }
`

const Empty = styled.li`
    padding: 0.5rem 0.75rem;
    color: var(--text-muted);
    font-size: 0.9rem;
`

/**
 * Searchable single-select. The field is the trigger: a click toggles the list, typing
 * filters it, arrows move, Enter picks, Escape or an outside click closes without changing
 * the selection.
 * @param {Object} props
 * @param {string} props.value - Selected option value
 * @param {Array<{ value: string, label: string }>} props.options
 * @param {Function} props.on_change - Receives the picked value
 * @param {string} [props.placeholder] - Search prompt shown while open
 * @param {string} [props.label] - Accessible name when there is no visible <label>
 * @param {string} [props.id] - Input id, for a visible <label htmlFor>
 * @param {boolean} [props.allow_custom] - Offer the typed text when nothing matches
 * @param {Function} [props.custom_label] - Label for the custom choice, e.g. q => `Use "${ q }"`
 */
export default function ComboBox( { value, options, on_change, placeholder = `Search…`, label, id, allow_custom = false, custom_label = q => `Use "${ q }"` } ) {

    const [ open, set_open ] = useState( false )
    const [ query, set_query ] = useState( `` )
    const [ active, set_active ] = useState( 0 )
    const wrapper_ref = useRef( null )
    const input_ref = useRef( null )
    const list_id = useId()
    const option_id = index => `${ list_id }-${ index }`

    const selected = options.find( option => option.value === value )

    const visible = useMemo( () => {
        const q = query.trim().toLowerCase()
        const matches = q ? options.filter( option => option.label.toLowerCase().includes( q ) ) : options
        const exact = matches.some( option => option.label.toLowerCase() === q )
        return allow_custom && q && !exact ? [ ...matches, { value: query.trim(), label: custom_label( query.trim() ), custom: true } ] : matches
    }, [ options, query, allow_custom, custom_label ] )

    const close = () => {
        set_open( false )
        set_query( `` )
    }

    const open_list = () => {
        const selected_index = options.findIndex( option => option.value === value )
        set_active( Math.max( 0, selected_index ) )
        set_open( true )
    }

    const pick = ( option ) => {
        if( !option ) return
        on_change( option.value )
        close()
    }

    // Outside clicks close without clearing the selection
    useEffect( () => {
        if( !open ) return
        const on_pointer = e => {
            if( !wrapper_ref.current?.contains( e.target ) ) close()
        }
        document.addEventListener( `mousedown`, on_pointer )
        document.addEventListener( `touchstart`, on_pointer )
        return () => {
            document.removeEventListener( `mousedown`, on_pointer )
            document.removeEventListener( `touchstart`, on_pointer )
        }
    }, [ open ] )

    // Keep the active option in view while arrowing through long lists
    useEffect( () => {
        if( open ) document.getElementById( option_id( active ) )?.scrollIntoView( { block: `nearest` } )
    }, [ open, active ] )

    const on_key_down = ( e ) => {
        if( e.key === `ArrowDown` || e.key === `ArrowUp` ) {
            e.preventDefault()
            if( !open ) return open_list()
            const step = e.key === `ArrowDown` ? 1 : -1
            set_active( current => ( current + step + visible.length ) % Math.max( 1, visible.length ) )
        } else if( e.key === `Home` && open ) {
            e.preventDefault()
            set_active( 0 )
        } else if( e.key === `End` && open ) {
            e.preventDefault()
            set_active( visible.length - 1 )
        } else if( e.key === `Enter` ) {
            if( !open ) return
            e.preventDefault()
            pick( visible[active] )
        } else if( e.key === `Escape` && open ) {
            // Do not let an enclosing modal close as well
            e.preventDefault()
            e.stopPropagation()
            close()
        } else if( e.key === `Tab` ) {
            close()
        }
    }

    return <Wrapper ref={ wrapper_ref }>
        <Input
            ref={ input_ref }
            id={ id }
            role="combobox"
            aria-label={ label }
            aria-expanded={ open }
            aria-controls={ list_id }
            aria-autocomplete="list"
            aria-activedescendant={ open && visible[active] ? option_id( active ) : undefined }
            autoComplete="off"
            value={ open ? query : selected?.label || value || `` }
            placeholder={ open ? placeholder : selected?.label || placeholder }
            onClick={ () => open ? close() : open_list() }
            onChange={ e => {
                set_query( e.target.value )
                set_active( 0 )
                if( !open ) set_open( true )
            } }
            onKeyDown={ on_key_down }
        />
        <Toggle
            type="button"
            tabIndex={ -1 }
            aria-hidden="true"
            $open={ open }
            onMouseDown={ e => e.preventDefault() }
            onClick={ () => {
                input_ref.current?.focus()
                open ? close() : open_list()
            } }
        >
            <ChevronDown strokeWidth={ 1.5 } />
        </Toggle>
        { open && <List id={ list_id } role="listbox" aria-label={ label }>
            { visible.map( ( option, index ) =>
                <Option
                    key={ `${ option.custom ? `custom:` : `` }${ option.value }` }
                    id={ option_id( index ) }
                    role="option"
                    aria-selected={ option.value === value }
                    data-active={ index === active }
                    onMouseDown={ e => e.preventDefault() }
                    onMouseEnter={ () => set_active( index ) }
                    onClick={ () => pick( option ) }
                >
                    { option.label }
                </Option>
            ) }
            { !visible.length && <Empty>No matches</Empty> }
        </List> }
    </Wrapper>

}
