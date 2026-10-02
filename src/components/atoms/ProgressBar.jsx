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
 * @param {string} [props.label] - Accessible name, e.g. "Reading progress"
 */
export default function ProgressBar( { percent = 0, label = `Progress` } ) {
    const clamped = Math.round( Math.min( 100, Math.max( 0, percent ) ) )
    return <Track role="progressbar" aria-label={ label } aria-valuemin={ 0 } aria-valuemax={ 100 } aria-valuenow={ clamped }>
        <Fill $percent={ clamped } />
    </Track>
}
