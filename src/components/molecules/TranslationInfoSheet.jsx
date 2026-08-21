import { useId, useState } from 'react'
import styled, { keyframes } from 'styled-components'

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
    padding-right: calc(44px + var(--space-s));
`

const TranslationDetails = styled.div`
    max-height: min(12rem, 35dvh);
    overflow-y: auto;
`

const TranslationSection = styled.section`
    min-width: 0;
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

const DirectWord = styled.button`
    appearance: none;
    display: inline;
    margin: 0 0 0 ${ p => p.$needs_separator ? `0.25em` : `0` };
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: none;
    color: inherit;
    font: inherit;
    line-height: inherit;
    text-decoration-line: ${ p => p.$selected ? `underline` : `none` };
    text-decoration-thickness: 2px;
    text-underline-offset: 0.15em;

    &:hover {
        color: var(--accent-dark);
    }

    &:focus-visible {
        outline: 2px solid var(--accent-dark);
        outline-offset: 2px;
    }
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

const ActionRow = styled.div`
    display: flex;
    gap: var(--space-xs);
    margin-top: var(--space-s);
`

const ActionButton = styled.button`
    min-height: 44px;
    padding: 0 var(--space-s);
    border: 1px solid var(--border);
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--text-muted);
    font-size: 0.78em;
    font-weight: 600;

    &:hover,
    &:focus-visible {
        background: var(--bg-hover);
        color: var(--text);
    }
`

const OriginalSentence = styled.div`
    margin-top: var(--space-s);
    padding-top: var(--space-s);
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.9em;
    line-height: 1.6;
`

/**
 * Shows direct word-by-word translation with source and explanation actions.
 * @param {Object} props
 * @param {string} props.original - Exact source sentence
 * @param {Array} [props.word_by_word_segments] - Literal translation display segments
 * @param {boolean} [props.word_by_word_loading] - Whether any literal word is loading
 * @param {Function} props.on_close - Closes the sheet
 * @param {Function} props.on_explain - Opens the existing explanation modal
 * @param {Function} props.on_select_word - Selects the corresponding word in the book sentence
 * @returns {JSX.Element}
 */
export default function TranslationInfoSheet( {
    original,
    word_by_word_segments = [],
    word_by_word_loading = false,
    on_close,
    on_explain,
    on_select_word
} ) {

    const [ show_original, set_show_original ] = useState( false )
    const original_id = useId()

    const word_by_word_content = word_by_word_segments.map( ( segment, index ) => {
        if( !segment.is_word ) return segment.text

        const direct_translation = segment.content
            || ( !segment.error && segment.can_lookup ? `...` : `Translation unavailable` )
        const selected_label = segment.selected
            ? <ScreenReaderOnly>Selected word: </ScreenReaderOnly>
            : null

        return <DirectWord
            key={ `${ index }-${ segment.word_index }` }
            type="button"
            $selected={ segment.selected }
            $needs_separator={ index > 0 && word_by_word_segments[index - 1].is_word }
            aria-label={ `Select ${ segment.text } in the book sentence` }
            aria-pressed={ segment.selected }
            data-direct-translation-word-index={ segment.word_index }
            data-selected={ segment.selected ? `true` : undefined }
            onClick={ () => on_select_word( segment ) }
        >
            { selected_label }
            { direct_translation }
        </DirectWord>
    } )

    return <Sheet
        data-translation-info-sheet
        aria-label="Translation information"
    >
        <CloseButton type="button" onClick={ on_close } aria-label="Close translation information">
            ×
        </CloseButton>

        <SheetContent>
            <TranslationDetails>
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

            <ActionRow>
                <ActionButton
                    type="button"
                    aria-expanded={ show_original }
                    aria-controls={ original_id }
                    onClick={ () => set_show_original( visible => !visible ) }
                >
                    Original
                </ActionButton>

                <ActionButton type="button" onClick={ on_explain }>
                    Explain
                </ActionButton>
            </ActionRow>

            { show_original && <OriginalSentence id={ original_id } data-original-sentence>
                <ScreenReaderOnly>Original sentence: </ScreenReaderOnly>
                { original }
            </OriginalSentence> }
        </SheetContent>
    </Sheet>

}
