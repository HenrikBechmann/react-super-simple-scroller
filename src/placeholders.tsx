// placeholders.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React from 'react'

import { isReservedID } from './utilities'

// A placeholder stands in a cell position the host has been asked to fill. Its id is the scroller's own, in the
// reserved form, and names the cradle generation it was placed in and its serial within that generation.
const PLACEHOLDER_PREFIX = '_~_ph:'

export const placeholderID = (generation, serial) => `${PLACEHOLDER_PREFIX}${generation}:${serial}_~_`

export const isPlaceholderID = (id) => isReservedID(id) && id.startsWith(PLACEHOLDER_PREFIX)

// how long a fetch may go unanswered before the same cells are asked for again (technical.FETCH_CEILING, ms)
export const DEFAULT_FETCH_CEILING = 5000

export const createPlaceholderState = () => ({
    generation: 0, // bumped by each reset, so an id never repeats across cradles
    serial: 0,
    askSerial: 0,
    map: new Map(), // placeholder id -> {direction, referenceID, askID, index}
    pending: null, // the one fetch out at a time: {startCode, direction, referenceID, count, attempt, controller, ceilingTimer, cradleActual, askID, ids}
    inlineController: null, // the signal given to fetches made with placeholders off
    // an end the host answered empty at: {cradleActual, endID, scrollTop, scrollLeft}. While the cradle, the row at
    // that end and the scroll position are as they were, a fill places nothing there, so an empty answer cannot
    // start a loop of placing, asking and removing. A scroll, a change at that end, a structural call, an explicit
    // fill or a reset clears it
    endOfData: {forward: null, backward: null},
})

const defaultStyles = {
    color: 'gray',
    fontSize: 'small',
    padding: '4px',
    boxSizing: 'border-box' as const,
    overflow: 'hidden',
}

// The placeholder the scroller shows when the host supplies none. It takes no size of its own: the cell
// container it stands in carries the cell dimensions, as it does for any cell. context is the host's
// operations.placeholderContext, passed untouched; context.text replaces the default text, and '' shows none.
export const DefaultPlaceholder = ({ context }) => {

    const text = (context && typeof context.text == 'string') ? context.text : 'fetching…'

    if (text === '') return null

    return <div data-type='placeholder' style={defaultStyles}>{text}</div>

}
