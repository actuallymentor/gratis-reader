import styled from 'styled-components'

const Badge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--radius-s);
    font-size: 0.8em;
    font-weight: 600;
    background: var(--accent-light);
    color: var(--accent-dark);
`

/**
 * Displays a proficiency level badge (e.g. "A1 · Toddler")
 * @param {Object} props
 * @param {string} props.cefr - e.g. "A1"
 * @param {string} props.label - e.g. "Toddler"
 */
export default function LevelBadge( { cefr, label } ) {
    return <Badge>{ cefr } · { label }</Badge>
}
