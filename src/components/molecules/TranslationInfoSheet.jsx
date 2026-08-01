import styled, { keyframes } from 'styled-components'
import Skeleton from '../atoms/Skeleton.jsx'

const open_sheet = keyframes`
    from { transform: translateY(0.75rem); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
`

const Sheet = styled.aside`
    position: relative;
    width: min(65ch, calc(100% - var(--space-xl)));
    margin: 0 auto;
    padding: var(--space-l);
    border: 1px solid var(--border);
    border-bottom: 0;
    border-radius: var(--radius-m) var(--radius-m) 0 0;
    background: var(--bg-surface);
    box-shadow: var(--shadow-m);
    color: var(--text);
    animation: ${ open_sheet } 0.2s ease-out;

    @media (max-width: 520px) {
        width: 100%;
        border-right: 0;
        border-left: 0;
        border-radius: 0;
    }
`

const CloseButton = styled.button`
    position: absolute;
    top: var(--space-xs);
    right: var(--space-xs);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    min-height: 44px;
    border: 0;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text);
    font-size: 1.5em;
    line-height: 1;

    &:hover,
    &:focus-visible {
        background: var(--bg-hover);
    }
`

const SheetContent = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--space-l);
    padding-right: calc(44px + var(--space-s));

    @media (max-width: 420px) {
        grid-template-columns: 1fr;
        gap: var(--space-m);
    }
`

const Meaning = styled.div`
    max-height: min(8rem, 25dvh);
    overflow-y: auto;
    font-size: 0.95em;
    line-height: 1.6;
    overflow-wrap: anywhere;
`

const MeaningError = styled.span`
    color: var(--text-muted);
`

const ExplainButton = styled.button`
    min-width: 7rem;
    min-height: 48px;
    padding: var(--space-s) var(--space-l);
    border: 1px solid var(--text);
    border-radius: var(--radius-s);
    background: var(--text);
    color: var(--bg-surface);
    font-weight: 700;

    &:hover,
    &:focus-visible {
        filter: brightness(0.9);
    }

    @media (max-width: 420px) {
        justify-self: end;
    }
`

/**
 * Shows the simplified source-language fragment and access to its full explanation.
 * @param {Object} props
 * @param {string} [props.meaning] - Simplified source-language fragment
 * @param {boolean} [props.loading] - Whether the source fragment is loading
 * @param {boolean} [props.error] - Whether the source fragment could not be loaded
 * @param {Function} props.on_close - Closes the sheet
 * @param {Function} props.on_explain - Opens the existing explanation modal
 * @returns {JSX.Element}
 */
export default function TranslationInfoSheet( {
    meaning,
    loading = false,
    error = false,
    on_close,
    on_explain
} ) {

    let meaning_content = <Skeleton width="100%" height="1.5em" />

    if( error ) meaning_content = <MeaningError>Meaning unavailable</MeaningError>
    else if( meaning ) meaning_content = meaning

    return <Sheet
        data-translation-info-sheet
        aria-label="Translation information"
        aria-busy={ loading }
    >
        <CloseButton type="button" onClick={ on_close } aria-label="Close translation information">
            ×
        </CloseButton>

        <SheetContent>
            <Meaning data-translation-meaning aria-live="polite">
                { meaning_content }
            </Meaning>

            <ExplainButton type="button" onClick={ on_explain }>
                Explain
            </ExplainButton>
        </SheetContent>
    </Sheet>

}
