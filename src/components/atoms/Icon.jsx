import styled from 'styled-components'

const IconSpan = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: ${ p => p.$size || `1em` };
    line-height: 1;
    user-select: none;
`

/**
 * Icon wrapper — renders an emoji or text icon with consistent sizing
 * @param {Object} props
 * @param {React.ReactNode} props.children - The icon content (emoji, text, etc.)
 * @param {string} [props.size] - CSS font-size value
 */
export default function Icon( { children, size, ...rest } ) {
    return <IconSpan $size={ size } { ...rest }>{ children }</IconSpan>
}
