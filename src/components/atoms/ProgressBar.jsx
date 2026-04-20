import styled from 'styled-components'

const Track = styled.div`
    width: 100%;
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    overflow: hidden;
`

const Fill = styled.div`
    height: 100%;
    width: ${ p => p.$percent }%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.3s ease;
`

/**
 * Simple progress bar
 * @param {Object} props
 * @param {number} props.percent - 0-100
 */
export default function ProgressBar( { percent = 0 } ) {
    return <Track>
        <Fill $percent={ Math.min( 100, Math.max( 0, percent ) ) } />
    </Track>
}
