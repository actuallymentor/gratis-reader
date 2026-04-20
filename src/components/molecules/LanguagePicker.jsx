import { useState, useMemo } from 'react'
import styled from 'styled-components'
import { COMMON_LANGUAGES } from '../../modules/prompts.js'

const Wrapper = styled.div`
    position: relative;
`

const Input = styled.input`
    width: 100%;
    padding: var(--space-s) var(--space-m);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    background: var(--bg);
    color: var(--text);
    font-size: 0.95em;
    outline: none;

    &:focus {
        border-color: var(--accent);
    }
`

const Dropdown = styled.ul`
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 200px;
    overflow-y: auto;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    margin-top: var(--space-xs);
    padding: 0;
    list-style: none;
    z-index: 50;
    box-shadow: var(--shadow-m);
`

const Option = styled.li`
    padding: var(--space-s) var(--space-m);
    cursor: pointer;
    min-height: 44px;
    display: flex;
    align-items: center;

    &:hover {
        background: var(--accent-light);
    }

    ${ p => p.$selected && `
        background: var(--accent-light);
        font-weight: 600;
    ` }
`

/**
 * Searchable language picker
 * @param {Object} props
 * @param {string} props.value - Currently selected language
 * @param {Function} props.on_change
 */
export default function LanguagePicker( { value, on_change } ) {

    const [ query, set_query ] = useState( `` )
    const [ is_open, set_is_open ] = useState( false )

    const filtered = useMemo( () => {
        if( !query ) return COMMON_LANGUAGES
        return COMMON_LANGUAGES.filter( lang =>
            lang.toLowerCase().includes( query.toLowerCase() )
        )
    }, [ query ] )

    const select = ( lang ) => {
        on_change( lang )
        set_query( `` )
        set_is_open( false )
    }

    return <Wrapper>
        <Input
            value={ is_open ? query : value }
            placeholder="Search languages..."
            onFocus={ () => set_is_open( true ) }
            onBlur={ () => setTimeout( () => set_is_open( false ), 200 ) }
            onChange={ ( e ) => set_query( e.target.value ) }
            onKeyDown={ ( e ) => {
                if( e.key === `Enter` && query.trim() ) {
                    select( query.trim() )
                }
            } }
        />

        { is_open && <Dropdown>
            { filtered.map( lang =>
                <Option
                    key={ lang }
                    $selected={ lang === value }
                    onMouseDown={ () => select( lang ) }
                >
                    { lang }
                </Option>
            ) }
            { filtered.length === 0 && query.trim() &&
                <Option onMouseDown={ () => select( query.trim() ) }>
                    Use "{ query.trim() }"
                </Option> }
        </Dropdown> }
    </Wrapper>

}
