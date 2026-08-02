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

const TranslationDetails = styled.div`
    display: grid;
    gap: var(--space-m);
    max-height: min(12rem, 35dvh);
    overflow-y: auto;
`

const TranslationSection = styled.section`
    min-width: 0;

    & + & {
        padding-top: var(--space-m);
        border-top: 1px solid var(--border);
    }
`

const SectionLabel = styled.h2`
    margin: 0 0 var(--space-xs);
    color: var(--text-muted);
    font-size: 0.75em;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
`

const TranslationValue = styled.div`
    font-size: 0.95em;
    line-height: 1.6;
    overflow-wrap: anywhere;
`

const MeaningError = styled.span`
    color: var(--text-muted);
`

const DirectWord = styled.span`
    font-weight: ${ p => p.$selected ? 700 : `inherit` };
    text-decoration-line: ${ p => p.$selected ? `underline` : `none` };
    text-decoration-thickness: 2px;
    text-underline-offset: 0.15em;
`

const ScreenReaderOnly = styled.span`
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
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
 * Shows a natural source-language meaning, direct word-by-word translation,
 * and access to the full translation explanation.
 * @param {Object} props
 * @param {string} [props.meaning] - Simplified source-language fragment
 * @param {boolean} [props.loading] - Whether the source fragment is loading
 * @param {boolean} [props.error] - Whether the source fragment could not be loaded
 * @param {Array} [props.word_by_word_segments] - Literal translation display segments
 * @param {boolean} [props.word_by_word_loading] - Whether any literal word is loading
 * @param {Function} props.on_close - Closes the sheet
 * @param {Function} props.on_explain - Opens the existing explanation modal
 * @returns {JSX.Element}
 */
export default function TranslationInfoSheet( {
    meaning,
    loading = false,
    error = false,
    word_by_word_segments = [],
    word_by_word_loading = false,
    on_close,
    on_explain
} ) {

    let meaning_content = <Skeleton width="100%" height="1.5em" />

    if( error ) meaning_content = <MeaningError>Meaning unavailable</MeaningError>
    else if( meaning ) meaning_content = meaning

    const word_by_word_content = word_by_word_segments.map( ( segment, index ) => {
        if( !segment.is_word ) return segment.text

        const direct_translation = segment.content
            || ( !segment.error && segment.can_lookup ? `...` : `Translation unavailable` )
        const selected_label = segment.selected
            ? <ScreenReaderOnly>Selected word: </ScreenReaderOnly>
            : null

        return <DirectWord
            key={ `${ index }-${ segment.word_index }` }
            $selected={ segment.selected }
            data-direct-translation-word-index={ segment.word_index }
            data-selected={ segment.selected ? `true` : undefined }
        >
            { selected_label }
            { direct_translation }
        </DirectWord>
    } )

    return <Sheet
        data-translation-info-sheet
        aria-label="Translation information"
        aria-busy={ loading }
    >
        <CloseButton type="button" onClick={ on_close } aria-label="Close translation information">
            ×
        </CloseButton>

        <SheetContent>
            <TranslationDetails>
                <TranslationSection>
                    <SectionLabel>Meaning</SectionLabel>
                    <TranslationValue data-translation-meaning aria-live="polite">
                        { meaning_content }
                    </TranslationValue>
                </TranslationSection>

                <TranslationSection>
                    <SectionLabel>Word by word</SectionLabel>
                    <TranslationValue
                        data-word-by-word-translation
                        aria-busy={ word_by_word_loading }
                    >
                        { word_by_word_content }
                    </TranslationValue>
                </TranslationSection>
            </TranslationDetails>

            <ExplainButton type="button" onClick={ on_explain }>
                Explain
            </ExplainButton>
        </SheetContent>
    </Sheet>

}
