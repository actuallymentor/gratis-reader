import styled from 'styled-components'
import { Check } from 'lucide-react'
import { LEVELS } from '../../modules/prompts.js'

const Grid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-s);
`

// Selected: accent tint and border, no dark rim and no large solid fill
const LevelCard = styled.button`
    position: relative;
    padding: var(--space-s) var(--space-m);
    border: 1px solid ${ p => p.$selected ? `var(--accent)` : `var(--border)` };
    border-radius: var(--radius-m);
    background: ${ p => p.$selected ? `var(--accent-light)` : `var(--bg-surface)` };
    color: var(--text);
    text-align: left;
    transition: background var(--duration-press) ease, border-color var(--duration-press) ease, transform var(--duration-press) ease;

    @media (hover: hover) {
        &:hover {
            border-color: var(--accent);
            transform: translateY(-1px);
        }
    }

    &:active { transform: scale(0.985); }
`

// Selected: a check beside the code, so the state never rests on colour alone
const Mark = styled( Check )`
    position: absolute;
    top: var(--space-s);
    right: var(--space-s);
    width: 1rem;
    height: 1rem;
    color: var(--accent-dark);
`

const LevelCode = styled.div`
    font-weight: 600;
    font-size: 0.9em;
    margin-bottom: var(--space-xs);
`

const LevelLabel = styled.div`
    font-size: 0.8em;
    opacity: 0.85;
`

/**
 * Proficiency level picker — cards for A0/A1/A2/B1-B2/C1-C2
 * @param {Object} props
 * @param {string} props.value - Current level code
 * @param {Function} props.on_change
 */
export default function LevelPicker( { value, on_change } ) {

    // Arrow keys move between levels like native radios
    const on_key_down = ( e, index ) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
        if( !step ) return
        e.preventDefault()
        const next = LEVELS[( index + step + LEVELS.length ) % LEVELS.length]
        on_change( next.code )
        e.currentTarget.parentElement.children[LEVELS.indexOf( next )]?.focus()
    }

    return <Grid role="radiogroup" aria-label="Proficiency level">
        { LEVELS.map( ( level, index ) =>
            <LevelCard
                key={ level.code }
                type="button"
                role="radio"
                aria-checked={ level.code === value }
                tabIndex={ level.code === value ? 0 : -1 }
                $selected={ level.code === value }
                onClick={ () => on_change( level.code ) }
                onKeyDown={ e => on_key_down( e, index ) }
            >
                { level.code === value && <Mark strokeWidth={ 2 } aria-hidden="true" /> }
                <LevelCode>{ level.cefr }</LevelCode>
                <LevelLabel>{ level.label }</LevelLabel>
            </LevelCard>
        ) }
    </Grid>

}
