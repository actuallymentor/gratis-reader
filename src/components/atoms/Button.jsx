import { forwardRef } from 'react'
import styled, { css, keyframes } from 'styled-components'

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

    /* Lift only where a pointer can hover; a tap on touch would leave the face raised */
    @media (hover: hover) {
        &:hover:not(:disabled) { transform: translateY(-1px); }
        &:hover:active:not(:disabled) { transform: translateY(-1px) scale(0.985); }
    }
    &:active:not(:disabled) { transform: scale(0.985); }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.45;
    }
`

// Attention sheen on the next important pending action: a 1400ms pass then 1600ms quiet, start to start 3000ms.
// It lives in its own clipped track so the button never needs overflow: hidden, which would clip the hit area.
const sheen = keyframes`
    0% { transform: translateX( -120% ) skewX( -18deg ); }
    46.7%, 100% { transform: translateX( 260% ) skewX( -18deg ); }
`

const SheenTrack = styled.span`
    position: absolute;
    inset: 0;
    border-radius: inherit;
    overflow: hidden;
    pointer-events: none;

    &::after {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 45%;
        background: linear-gradient( 90deg, transparent, rgba( 255, 255, 255, .26 ), transparent );
        animation: ${ sheen } 3000ms ease-in-out infinite;
    }

    @media (prefers-reduced-motion: reduce) { display: none; }
`

/**
 * Pill button. Primary actions keep their label; icons are 16px Lucide glyphs.
 * @param {Object} props
 * @param {'primary'|'secondary'|'quiet'|'danger'|'danger_solid'} [props.variant=secondary]
 * @param {boolean} [props.block] - Stretch to the container width
 * @param {React.ReactNode} [props.icon] - Leading icon element
 * @param {boolean} [props.attention] - Sheen marking the next important pending action (see use_attention)
 */
export const Button = forwardRef( ( { variant = `secondary`, block = false, icon, attention = false, children, type = `button`, ...rest }, ref ) => {
    return <ButtonBase ref={ ref } type={ type } $variant={ variant } $block={ block } { ...rest }>
        { attention && <SheenTrack aria-hidden="true" /> }
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

    /* Square 44px tap target around a round face: neighbours need a 12px gap to stay clear of it */
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
