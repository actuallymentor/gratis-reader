import styled from 'styled-components'

// Restrained abstract artwork for the landing page. Every shape reads its colour from theme
// tokens, so light, dark and sepia all work without separate assets. Decorative only.
const Svg = styled.svg`
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;

    .page { fill: var(--bg-surface); stroke: var(--border); stroke-width: 1.5; }
    .line { fill: var(--border); }
    .muted { fill: var(--text-muted); opacity: .35; }
    .accent { fill: var(--accent); }
    .accent_soft { fill: var(--accent-light); }
    .coral { fill: var(--coral); }
    .coral_soft { fill: var(--coral); opacity: .14; }
    .shadow { filter: drop-shadow( 0 8px 24px rgba( 0, 0, 0, .08 ) ); }
`

// A row of rounded "words": widths in svg units, laid out left to right with a fixed gap
const Words = ( { x, y, widths, height = 8, gap = 6, className = `line`, highlight = -1, highlight_class = `coral` } ) => {

    let cursor = x

    return widths.map( ( width, index ) => {
        const word_x = cursor
        cursor += width + gap
        const word_class = index === highlight ? highlight_class : className
        return <rect key={ index } x={ word_x } y={ y } width={ width } height={ height } rx={ height / 2 } className={ word_class } />
    } )

}

const ArtFrame = ( { view_box, children, ...rest } ) => <Svg viewBox={ view_box } aria-hidden="true" focusable="false" { ...rest }>
    { children }
</Svg>

/**
 * Hero: an open page where one sentence is rewritten (accent) beneath its original (muted),
 * and a tapped word (coral) shows its gloss in a small floating card.
 */
export const HeroArt = props => <ArtFrame view_box="0 0 440 380" { ...props }>

    { /* Soft backdrop */ }
    <circle cx="250" cy="190" r="170" className="accent_soft" />
    <circle cx="380" cy="70" r="26" className="coral_soft" />

    { /* Back page, slightly turned */ }
    <g transform="rotate( -5 200 200 )">
        <rect x="70" y="58" width="270" height="300" rx="18" className="page" />
    </g>

    { /* Front page */ }
    <g className="shadow">
        <rect x="100" y="40" width="270" height="300" rx="18" className="page" />
    </g>

    <Words x={ 128 } y={ 76 } widths={ [ 54, 30, 72, 44 ] } />
    <Words x={ 128 } y={ 98 } widths={ [ 38, 66, 28, 58 ] } />
    <Words x={ 128 } y={ 120 } widths={ [ 70, 40, 52 ] } />

    { /* The original sentence, faded… */ }
    <Words x={ 128 } y={ 162 } widths={ [ 46, 58, 34, 62 ] } className="muted" />

    { /* …and its rewrite for the reader's level, one word tapped */ }
    <Words x={ 128 } y={ 184 } widths={ [ 40, 52, 66, 36 ] } className="accent" highlight={ 2 } />

    <Words x={ 128 } y={ 226 } widths={ [ 62, 36, 48, 50 ] } />
    <Words x={ 128 } y={ 248 } widths={ [ 34, 70, 42 ] } />
    <Words x={ 128 } y={ 270 } widths={ [ 58, 44, 64, 28 ] } />
    <Words x={ 128 } y={ 292 } widths={ [ 48, 32 ] } />

    { /* Gloss card above the tapped word */ }
    <g className="shadow">
        <rect x="218" y="196" width="150" height="56" rx="12" className="page" />
    </g>
    <path d="M 252 196 l 8 -8 l 8 8 z" className="page" />
    <rect x="234" y="212" width="58" height="8" rx="4" className="coral" />
    <rect x="234" y="230" width="104" height="6" rx="3" className="line" />

</ArtFrame>

/**
 * Levels: the same paragraph at three levels, shorter and simpler at the top.
 */
export const LevelArt = props => <ArtFrame view_box="0 0 320 220" { ...props }>

    <circle cx="160" cy="110" r="100" className="accent_soft" />

    { [ 0, 1, 2 ].map( level => {
        const y = 28 + level * 60
        return <g key={ level }>
            <g className="shadow"><rect x="40" y={ y } width="240" height="44" rx="12" className="page" /></g>
            { [ 0, 1, 2 ].map( dot => <circle key={ dot } cx={ 60 + dot * 12 } cy={ y + 22 } r="4" className={ dot <= level ? `accent` : `line` } /> ) }
            <Words x={ 104 } y={ y + 12 } widths={ [ [ 50 ], [ 34, 48, 30 ], [ 26, 40, 22, 36, 20 ] ][ level ] } height={ 7 } gap={ 5 } />
            <Words x={ 104 } y={ y + 25 } widths={ [ [ 30 ], [ 42, 56 ], [ 38, 24, 46, 30 ] ][ level ] } height={ 7 } gap={ 5 } />
        </g>
    } ) }

</ArtFrame>

/**
 * Peek: a sentence with its original revealed underneath and a word lifted out for its meaning.
 */
export const PeekArt = props => <ArtFrame view_box="0 0 320 220" { ...props }>

    <circle cx="170" cy="120" r="96" className="coral_soft" />

    <g className="shadow"><rect x="30" y="70" width="260" height="110" rx="16" className="page" /></g>

    <Words x={ 54 } y={ 98 } widths={ [ 44, 30, 56, 38, 34 ] } className="accent" highlight={ 2 } />
    <rect x="54" y="120" width="212" height="1.5" className="line" />
    <Words x={ 54 } y={ 136 } widths={ [ 52, 40, 30, 60 ] } className="muted" />
    <Words x={ 54 } y={ 154 } widths={ [ 36, 48 ] } className="muted" />

    { /* Lifted word */ }
    <g className="shadow"><rect x="112" y="20" width="120" height="40" rx="20" className="page" /></g>
    <rect x="130" y="36" width="48" height="8" rx="4" className="coral" />
    <rect x="186" y="37" width="30" height="6" rx="3" className="line" />
    <path d="M 152 60 l 8 8 l 8 -8 z" className="page" />

</ArtFrame>

/**
 * Private: a browser window holding a shelf of books; nothing leaves the frame.
 */
export const ShelfArt = props => <ArtFrame view_box="0 0 320 220" { ...props }>

    <circle cx="160" cy="116" r="100" className="accent_soft" />

    <g className="shadow"><rect x="40" y="30" width="240" height="160" rx="16" className="page" /></g>
    <rect x="40" y="62" width="240" height="1.5" className="line" />
    { [ 0, 1, 2 ].map( dot => <circle key={ dot } cx={ 60 + dot * 12 } cy="46" r="4" className="line" /> ) }

    { /* Book spines, each with two bands; the last one leans on its neighbour */ }
    { [
        [ 76, 22, 88, `accent` ],
        [ 102, 18, 74, `line` ],
        [ 124, 26, 96, `coral` ],
        [ 154, 20, 80, `line` ],
        [ 178, 24, 92, `accent` ],
    ].map( ( [ x, width, height, tone ] ) => <g key={ x }>
        <rect x={ x } y={ 172 - height } width={ width } height={ height } rx="3" className={ tone } />
        <rect x={ x + 4 } y={ 172 - height + 12 } width={ width - 8 } height="3" rx="1.5" className="page" />
        <rect x={ x + 4 } y={ 172 - 20 } width={ width - 8 } height="3" rx="1.5" className="page" />
    </g> ) }
    <g transform="rotate( -16 246 172 )">
        <rect x="226" y="94" width="20" height="78" rx="3" className="line" />
    </g>
    <rect x="60" y="172" width="200" height="3" rx="1.5" className="line" />

</ArtFrame>
