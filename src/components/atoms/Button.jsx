import { forwardRef } from 'react'
import styled, { css } from 'styled-components'

// Small pill faces with a larger invisible tap area (≥44px) that never overlaps neighbours:
// the face is 2rem high, the ::before extends 6px vertically and 4px sideways.
const hit_area = css`
    &::before {
        content: '';
        position: absolute;
        inset: -0.375rem -0.25rem;
    }
`

const variants = {
    primary: css`
        background: var(--accent);
        border-color: var(--accent);
        color: #ffffff;

        &:hover:not(:disabled) { background: var(--accent-dark); border-color: var(--accent-dark); }
    `,
    secondary: css`
        background: transparent;
        border-color: var(--border);
        color: var(--text);

        &:hover:not(:disabled) { background: var(--bg-hover); }
    `,
    quiet: css`
        background: transparent;
        border-color: transparent;
        color: var(--text-muted);

        &:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
    `,
    danger: css`
        background: transparent;
        border-color: var(--danger);
        color: var(--danger);

        &:hover:not(:disabled) { background: var(--danger-tint); }
    `,
    danger_solid: css`
        background: var(--danger-solid);
        border-color: var(--danger-solid);
        color: #ffffff;

        &:hover:not(:disabled) { filter: brightness(0.92); }
    `
}

export const ButtonBase = styled.button`
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4em;
    min-height: 2rem;
    padding: 0.2rem 0.875rem;
    border: 1px solid transparent;
    border-radius: 999px;
    font-family: inherit;
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    text-decoration: none;
    transition: transform var(--duration-press) ease, background var(--duration-press) ease,
        border-color var(--duration-press) ease, color var(--duration-press) ease, box-shadow var(--duration-press) ease;

    ${ hit_area }
    ${ p => variants[p.$variant || `secondary`] }

    ${ p => p.$block && css`width: 100%;` }

    svg {
        flex-shrink: 0;
        width: 1rem;
        height: 1rem;
    }

    &:hover:not(:disabled) { transform: translateY(-1px); }
    &:active:not(:disabled) { transform: scale(0.985); }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }
`

/**
 * Pill button. Primary actions keep their label; icons are 16px Lucide glyphs.
 * @param {Object} props
 * @param {'primary'|'secondary'|'quiet'|'danger'|'danger_solid'} [props.variant=secondary]
 * @param {boolean} [props.block] - Stretch to the container width
 * @param {React.ReactNode} [props.icon] - Leading icon element
 */
export const Button = forwardRef( ( { variant = `secondary`, block = false, icon, children, type = `button`, ...rest }, ref ) => {
    return <ButtonBase ref={ ref } type={ type } $variant={ variant } $block={ block } { ...rest }>
        { icon }
        { children }
    </ButtonBase>
} )

const IconFace = styled( ButtonBase )`
    width: 2rem;
    min-width: 2rem;
    padding: 0;

    svg {
        width: 1.25rem;
        height: 1.25rem;
    }

    /* Square tap target around a round face */
    &::before { inset: -0.375rem; }
`

/**
 * Icon-only pill button. The label is required: it becomes the accessible name and tooltip.
 * @param {Object} props
 * @param {string} props.label
 * @param {React.ReactNode} props.icon
 * @param {'secondary'|'quiet'|'primary'} [props.variant=quiet]
 */
export const IconButton = forwardRef( ( { label, icon, variant = `quiet`, type = `button`, ...rest }, ref ) => {
    return <IconFace ref={ ref } type={ type } $variant={ variant } aria-label={ label } title={ label } { ...rest }>
        { icon }
    </IconFace>
} )

export default Button
