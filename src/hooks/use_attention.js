import { useEffect, useState } from 'react'

// Typing must pause this long before a pending action starts to shimmer
export const ATTENTION_DELAY_MS = 800

/**
 * Whether the next important pending action should shimmer: only while it is pending, only once
 * typing pauses, and never in a hidden document. Any change in `reset_on` restarts the delay.
 * @param {boolean} pending - The action is available and has not run yet
 * @param {*} reset_on - Value that changes while the user types, e.g. the field's draft
 * @returns {boolean}
 */
export default function use_attention( pending, reset_on ) {

    const [ attention, set_attention ] = useState( false )

    useEffect( () => {

        set_attention( false )
        if( !pending ) return

        let timer = null
        const schedule = () => {
            clearTimeout( timer )
            set_attention( false )
            if( !document.hidden ) timer = setTimeout( () => set_attention( true ), ATTENTION_DELAY_MS )
        }

        schedule()
        document.addEventListener( `visibilitychange`, schedule )

        return () => {
            clearTimeout( timer )
            document.removeEventListener( `visibilitychange`, schedule )
        }

    }, [ pending, reset_on ] )

    return attention

}
