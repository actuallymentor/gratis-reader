import styled from 'styled-components'

const Row = styled.button`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-m);
    width: 100%;
    min-height: 2.75rem;
    padding: var(--space-s) var(--space-m);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--bg-surface);
    color: var(--text-muted);
    font: inherit;
    font-size: 0.9rem;
    line-height: 1.45;
    text-align: left;
    transition: background var(--duration-press) ease;

    @media (hover: hover) {
        &:hover { background: var(--bg-hover); }
    }
`

const Track = styled.span`
    position: relative;
    flex-shrink: 0;
    width: 2.5rem;
    height: 1.5rem;
    border-radius: 999px;
    background: ${ p => p.$on ? `var(--accent)` : `var(--border)` };
    transition: background 160ms ease;

    &::after {
        content: '';
        position: absolute;
        top: 0.1875rem;
        left: ${ p => p.$on ? `1.1875rem` : `0.1875rem` };
        width: 1.125rem;
        height: 1.125rem;
        border-radius: 50%;
        background: #ffffff;
        box-shadow: var(--shadow-s);
        transition: left 160ms var(--ease-out);
    }
`

/**
 * On/off switch where the whole row is the control
 * @param {Object} props
 * @param {boolean} props.checked
 * @param {Function} props.on_toggle
 * @param {string} props.labelledby - Id of the visible label
 * @param {string} [props.describedby] - Id of the description inside the row
 * @param {React.ReactNode} props.children - Description shown in the row
 */
export default function SwitchRow( { checked, on_toggle, labelledby, describedby, children } ) {
    return <Row type="button" role="switch" aria-checked={ checked } aria-labelledby={ labelledby } aria-describedby={ describedby } onClick={ on_toggle }>
        <span id={ describedby }>{ children }</span>
        <Track $on={ checked } aria-hidden="true" />
    </Row>
}
