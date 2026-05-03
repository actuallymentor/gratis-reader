import styled from 'styled-components'
import { LEVELS } from '../../modules/prompts.js'

const Grid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-s);
`

const LevelCard = styled.button`
    background: ${ p => p.$selected ? `var(--accent)` : `var(--bg)` };
    color: ${ p => p.$selected ? `white` : `var(--text)` };
    border: 2px solid ${ p => p.$selected ? `var(--accent)` : `var(--border)` };
    border-radius: var(--radius-m);
    padding: var(--space-m);
    text-align: left;
    transition: all 0.2s ease;
    min-height: 44px;

    &:hover {
        border-color: var(--accent);
    }
`

const LevelCode = styled.div`
    font-weight: 700;
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

    return <Grid>
        { LEVELS.map( level =>
            <LevelCard
                key={ level.code }
                $selected={ level.code === value }
                onClick={ () => on_change( level.code ) }
            >
                <LevelCode>{ level.cefr }</LevelCode>
                <LevelLabel>{ level.label }</LevelLabel>
            </LevelCard>
        ) }
    </Grid>

}
