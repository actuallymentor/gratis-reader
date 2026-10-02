import { useEffect, useRef } from 'react'
import styled, { keyframes } from 'styled-components'

// Restrained abstract artwork for the landing page. Every shape reads its colour from theme
// tokens, so light, dark and sepia all work without separate assets. Decorative only.
//
// Motion: gentle, seamless loops with independent periods and phases, so nothing moves in step.
// Every loop starts and ends on the drawn pose, which doubles as the static composition shown
// before playback starts, under reduced motion, and while the artwork is offscreen or the tab hidden.

const drift = keyframes`
    0%, 100% { transform: translate( 0, 0 ); }
    50% { transform: translate( var(--dx, 0px), var(--dy, -4px) ); }
`

const sway = keyframes`
    0%, 100% { transform: rotate( 0deg ); }
    50% { transform: rotate( var(--angle, 2deg) ); }
`

const breathe = keyframes`
    0%, 100% { opacity: var(--high, 1); }
    50% { opacity: var(--low, .6); }
`

const shade = keyframes`
    0%, 100% { fill: var(--from); }
    50% { fill: var(--to); }
`

// A soft band of light travelling along a line; it is clipped, so the wrap-around is never seen
const sweep = keyframes`
    from { transform: translateX( -120px ); }
    to { transform: translateX( 360px ); }
`

const Svg = styled.svg`
    display: block;
    width: 100%;
    height: auto;
    overflow: visible;

    --art-gold: #f0c040;

    .page { fill: var(--bg-surface); stroke: var(--border); stroke-width: 1.5; }
    .line { fill: var(--border); }
    .muted { fill: var(--text-muted); opacity: .35; }
    .accent { fill: var(--accent); }
    .accent_soft { fill: var(--accent-light); }
    .coral { fill: var(--coral); }
    .coral_soft { fill: var(--coral); opacity: .14; }
    .gold_soft { fill: var(--art-gold); opacity: .22; }
    .shadow { filter: drop-shadow( 0 8px 24px rgba( 0, 0, 0, .08 ) ); }

    /* Movers rotate and translate around their own box unless told otherwise */
    .drift, .sway { transform-box: fill-box; transform-origin: var(--origin, center); }
    .drift { animation: ${ drift } var(--t) ease-in-out var(--d) infinite; }
    .sway { animation: ${ sway } var(--t) ease-in-out var(--d) infinite; }
    .breathe { animation: ${ breathe } var(--t) ease-in-out var(--d) infinite; }
    .shade { animation: ${ shade } var(--t) ease-in-out var(--d) infinite; }
    .sweep { animation: ${ sweep } var(--t) linear var(--d) infinite; }

    /* Offscreen or hidden tab: hold the current frame and resume from it without a jump */
    &[data-paused] * { animation-play-state: paused; }

    @media (prefers-reduced-motion: reduce) {
        * { animation: none !important; }
    }
`

/**
 * Loop timing as inline custom properties: period in seconds, and how far into its cycle the loop
 * starts (a negative delay), so neighbours never share a phase.
 */
const loop = ( period, phase = 0, extra = {} ) => ( { '--t': `${ period }s`, '--d': `${ -phase }s`, ...extra } )

// A row of rounded "words": widths in svg units, laid out left to right with a fixed gap
const Words = ( { x, y, widths, height = 8, gap = 6, className = `line`, highlight = -1, highlight_class = `coral`, highlight_style } ) => {

    let cursor = x

    return widths.map( ( width, index ) => {
        const word_x = cursor
        cursor += width + gap
        const is_highlight = index === highlight
        return <rect
            key={ index }
            x={ word_x }
            y={ y }
            width={ width }
            height={ height }
            rx={ height / 2 }
            className={ is_highlight ? highlight_class : className }
            style={ is_highlight ? highlight_style : undefined }
        />
    } )

}

// Pauses every loop while the artwork is offscreen or the document is hidden
const ArtFrame = ( { view_box, children, ...rest } ) => {

    const ref = useRef( null )

    useEffect( () => {

        const svg = ref.current
        let visible = false
        const update = () => svg.toggleAttribute( `data-paused`, !visible || document.hidden )

        const observer = new IntersectionObserver( ( [ entry ] ) => {
            visible = entry.isIntersecting
            update()
        } )
        observer.observe( svg )
        document.addEventListener( `visibilitychange`, update )

        return () => {
            observer.disconnect()
            document.removeEventListener( `visibilitychange`, update )
        }

    }, [] )

    // Paused until the observer reports the artwork on screen
    return <Svg ref={ ref } viewBox={ view_box } aria-hidden="true" focusable="false" data-paused="" { ...rest }>
        { children }
    </Svg>

}

const CORAL_SHADES = { '--from': `var(--coral)`, '--to': `#eba17a` }
const ACCENT_SHADES = { '--from': `var(--accent)`, '--to': `#a8d6e2` }

/**
 * Hero: an open page where one sentence is rewritten (accent) beneath its original (muted),
 * and a tapped word (coral) shows its gloss in a small floating card.
 */
export const HeroArt = props => <ArtFrame view_box="0 0 440 380" { ...props }>

    <defs>
        <clipPath id="hero-rewrite-line"><rect x="128" y="184" width="230" height="8" rx="4" /></clipPath>
        <linearGradient id="hero-glint" x1="0" x2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset=".5" stopColor="#ffffff" stopOpacity=".7" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
    </defs>

    { /* Soft backdrop: the large circle breathes, the small ones wander and warm */ }
    <circle cx="250" cy="190" r="170" className="accent_soft breathe" style={ loop( 11, 2, { '--low': .55 } ) } />
    <g className="drift" style={ loop( 13, 4, { '--dx': `-8px`, '--dy': `10px` } ) }>
        <circle cx="380" cy="70" r="26" className="coral_soft" />
    </g>
    <g className="drift" style={ loop( 17, 9, { '--dx': `10px`, '--dy': `-6px` } ) }>
        <circle cx="74" cy="318" r="16" className="gold_soft" />
    </g>

    { /* Back page, slightly turned, swaying a little on its lower edge */ }
    <g transform="rotate( -5 200 200 )">
        <g className="sway" style={ loop( 14, 3, { '--angle': `1.6deg`, '--origin': `50% 100%` } ) }>
            <rect x="70" y="58" width="270" height="300" rx="18" className="page" />
        </g>
    </g>

    { /* Front page stays still: it is the thing being read */ }
    <g className="shadow">
        <rect x="100" y="40" width="270" height="300" rx="18" className="page" />
    </g>

    <Words x={ 128 } y={ 76 } widths={ [ 54, 30, 72, 44 ] } />
    <Words x={ 128 } y={ 98 } widths={ [ 38, 66, 28, 58 ] } />
    <Words x={ 128 } y={ 120 } widths={ [ 70, 40, 52 ] } />

    { /* The original sentence, faded… */ }
    <g className="breathe" style={ loop( 9, 5, { '--low': .55 } ) }>
        <Words x={ 128 } y={ 162 } widths={ [ 46, 58, 34, 62 ] } className="muted" />
    </g>

    { /* …and its rewrite for the reader's level, one word tapped, light flowing along it */ }
    <Words x={ 128 } y={ 184 } widths={ [ 40, 52, 66, 36 ] } className="accent" highlight={ 2 } highlight_class="coral shade" highlight_style={ loop( 6, 1, CORAL_SHADES ) } />
    <g clipPath="url(#hero-rewrite-line)">
        <rect x="0" y="184" width="70" height="8" fill="url(#hero-glint)" className="sweep" style={ loop( 7.5, 2 ) } />
    </g>

    <Words x={ 128 } y={ 226 } widths={ [ 62, 36, 48, 50 ] } />
    <Words x={ 128 } y={ 248 } widths={ [ 34, 70, 42 ] } />
    <Words x={ 128 } y={ 270 } widths={ [ 58, 44, 64, 28 ] } />
    <Words x={ 128 } y={ 292 } widths={ [ 48, 32 ] } />

    { /* Gloss card above the tapped word, floating gently */ }
    <g className="drift" style={ loop( 7, 0, { '--dy': `-5px` } ) }>
        <g className="shadow">
            <rect x="218" y="196" width="150" height="56" rx="12" className="page" />
        </g>
        <path d="M 252 196 l 8 -8 l 8 8 z" className="page" />
        <rect x="234" y="212" width="58" height="8" rx="4" className="coral shade" style={ loop( 6, 1, CORAL_SHADES ) } />
        <rect x="234" y="230" width="104" height="6" rx="3" className="line" />
    </g>

</ArtFrame>

/**
 * Levels: the same paragraph at three levels, shorter and simpler at the top.
 */
export const LevelArt = props => <ArtFrame view_box="0 0 320 220" { ...props }>

    <circle cx="160" cy="110" r="100" className="accent_soft breathe" style={ loop( 12, 3, { '--low': .55 } ) } />
    <g className="drift" style={ loop( 15, 6, { '--dx': `6px`, '--dy': `8px` } ) }>
        <circle cx="270" cy="34" r="14" className="gold_soft" />
    </g>

    { [ 0, 1, 2 ].map( level => {
        const y = 28 + level * 60
        return <g key={ level } className="drift" style={ loop( 9 + level * 2.5, level * 3.1, { '--dx': `${ level % 2 ? -4 : 4 }px`, '--dy': `0px` } ) }>
            <g className="shadow"><rect x="40" y={ y } width="240" height="44" rx="12" className="page" /></g>
            { [ 0, 1, 2 ].map( dot => <circle
                key={ dot }
                cx={ 60 + dot * 12 }
                cy={ y + 22 }
                r="4"
                className={ dot <= level ? `accent shade` : `line` }
                style={ dot <= level ? loop( 8, level * 2 + dot * .9, ACCENT_SHADES ) : undefined }
            /> ) }
            <Words x={ 104 } y={ y + 12 } widths={ [ [ 50 ], [ 34, 48, 30 ], [ 26, 40, 22, 36, 20 ] ][ level ] } height={ 7 } gap={ 5 } />
            <Words x={ 104 } y={ y + 25 } widths={ [ [ 30 ], [ 42, 56 ], [ 38, 24, 46, 30 ] ][ level ] } height={ 7 } gap={ 5 } />
        </g>
    } ) }

</ArtFrame>

/**
 * Peek: a sentence with its original revealed underneath and a word lifted out for its meaning.
 */
export const PeekArt = props => <ArtFrame view_box="0 0 320 220" { ...props }>

    <circle cx="170" cy="120" r="96" className="coral_soft breathe" style={ loop( 11, 4, { '--high': .14, '--low': .08 } ) } />

    <g className="shadow"><rect x="30" y="70" width="260" height="110" rx="16" className="page" /></g>

    <Words x={ 54 } y={ 98 } widths={ [ 44, 30, 56, 38, 34 ] } className="accent" highlight={ 2 } highlight_class="coral shade" highlight_style={ loop( 6.5, 2, CORAL_SHADES ) } />
    <rect x="54" y="120" width="212" height="1.5" className="line" />
    <g className="breathe" style={ loop( 10, 1, { '--low': .5 } ) }>
        <Words x={ 54 } y={ 136 } widths={ [ 52, 40, 30, 60 ] } className="muted" />
        <Words x={ 54 } y={ 154 } widths={ [ 36, 48 ] } className="muted" />
    </g>

    { /* Lifted word, floating */ }
    <g className="drift" style={ loop( 8, 3, { '--dy': `-6px` } ) }>
        <g className="shadow"><rect x="112" y="20" width="120" height="40" rx="20" className="page" /></g>
        <rect x="130" y="36" width="48" height="8" rx="4" className="coral shade" style={ loop( 6.5, 2, CORAL_SHADES ) } />
        <rect x="186" y="37" width="30" height="6" rx="3" className="line" />
        <path d="M 152 60 l 8 8 l 8 -8 z" className="page" />
    </g>

</ArtFrame>

/**
 * Private: a browser window holding a shelf of books; nothing leaves the frame.
 */
export const ShelfArt = props => <ArtFrame view_box="0 0 320 220" { ...props }>

    <circle cx="160" cy="116" r="100" className="accent_soft breathe" style={ loop( 13, 5, { '--low': .55 } ) } />

    <g className="shadow"><rect x="40" y="30" width="240" height="160" rx="16" className="page" /></g>
    <rect x="40" y="62" width="240" height="1.5" className="line" />
    { [ 0, 1, 2 ].map( dot => <circle key={ dot } cx={ 60 + dot * 12 } cy="46" r="4" className="line" /> ) }

    { /* Book spines, each with two bands; colours warm and cool at their own pace */ }
    { [
        [ 76, 22, 88, `accent`, loop( 11, 0, ACCENT_SHADES ) ],
        [ 102, 18, 74, `line` ],
        [ 124, 26, 96, `coral`, loop( 14, 5, { '--from': `var(--coral)`, '--to': `#e9a55c` } ) ],
        [ 154, 20, 80, `line` ],
        [ 178, 24, 92, `accent`, loop( 9.5, 6, ACCENT_SHADES ) ],
    ].map( ( [ x, width, height, tone, motion ] ) => <g key={ x }>
        <rect x={ x } y={ 172 - height } width={ width } height={ height } rx="3" className={ motion ? `${ tone } shade` : tone } style={ motion } />
        <rect x={ x + 4 } y={ 172 - height + 12 } width={ width - 8 } height="3" rx="1.5" className="page" />
        <rect x={ x + 4 } y={ 172 - 20 } width={ width - 8 } height="3" rx="1.5" className="page" />
    </g> ) }

    { /* The last book leans on its neighbour, rocking slightly on its bottom corner */ }
    <g transform="rotate( -16 246 172 )">
        <g className="sway" style={ loop( 9, 2, { '--angle': `-2.5deg`, '--origin': `100% 100%` } ) }>
            <rect x="226" y="94" width="20" height="78" rx="3" className="line" />
        </g>
    </g>
    <rect x="60" y="172" width="200" height="3" rx="1.5" className="line" />

</ArtFrame>
