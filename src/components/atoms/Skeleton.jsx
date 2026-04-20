import styled, { keyframes } from 'styled-components'

const shimmer = keyframes`
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
`

const SkeletonBlock = styled.div`
    width: ${ p => p.$width || `100%` };
    height: ${ p => p.$height || `1em` };
    border-radius: var(--radius-s);
    background: linear-gradient(
        90deg,
        var(--border) 25%,
        var(--bg-hover) 50%,
        var(--border) 75%
    );
    background-size: 200% 100%;
    animation: ${ shimmer } 1.5s ease infinite;
`

/**
 * Loading skeleton placeholder
 * @param {Object} props
 * @param {string} [props.width] - CSS width
 * @param {string} [props.height] - CSS height
 */
export default function Skeleton( { width, height, ...rest } ) {
    return <SkeletonBlock $width={ width } $height={ height } { ...rest } />
}

// Skeleton for a line of text
export const SkeletonLine = styled( SkeletonBlock )`
    margin-bottom: var(--space-s);

    &:last-child {
        width: 60%;
    }
`

// Skeleton for a paragraph (multiple lines)
export function SkeletonParagraph( { lines = 3 } ) {
    return <div style={ { marginBottom: `var(--space-l)` } }>
        { Array.from( { length: lines } ).map( ( _, i ) =>
            <SkeletonLine key={ i } $height="1.2em" />
        ) }
    </div>
}
