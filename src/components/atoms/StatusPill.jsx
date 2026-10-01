import styled from 'styled-components'

const tones = {
    info: `background: var(--accent-light); color: var(--text);`,
    warning: `background: var(--warning-tint); color: var(--warning-text);`,
    neutral: `background: var(--bg-hover); color: var(--text-muted);`
}

const Pill = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 0.35em;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
    ${ p => tones[p.$tone] }

    svg { width: 0.875rem; height: 0.875rem; flex-shrink: 0; }
    svg.spin { animation: spin 1.2s linear infinite; }
`

/**
 * Small tinted status pill: semantic icon plus text, never colour alone
 * @param {Object} props
 * @param {'info'|'warning'|'neutral'} [props.tone=neutral]
 * @param {React.ReactNode} props.icon
 */
export default function StatusPill( { tone = `neutral`, icon, children, ...rest } ) {
    return <Pill $tone={ tone } { ...rest }>{ icon }{ children }</Pill>
}
