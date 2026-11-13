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
    pending: null, // the one fetch out at a time: {startCode, direction, referenceID, count, endAsk, attempt, controller, ceilingTimer, cradleActual, askID}
    inlineController: null, // the signal given to fetches made with placeholders off
    badOptions: new Map(), // option name -> Set of the values reported for it, so each is reported once
    // an end the host answered empty at, or failed to answer: {reason: 'end' | 'failed', cradleActual, endID}. While
    // the cradle and the row at that end are as they were, a fill places nothing there, so an empty or failed answer
    // cannot start a loop of placing, asking and removing. A change at that end, a gesture past the end's mark (the
    // end state's re-ask), a structural call, an explicit fill or a reset clears it
    quiet: {forward: null, backward: null},
    // an end the end state is asking again, with placeholders on: {cradleActual, endID}. Nothing is placed there for
    // that ask, and its rows are added at the end
    endAsk: {forward: null, backward: null},
})

export const END_INDICATOR_TEXT = { start: 'start of list', end: 'end of list', searching: 'searching…' }

// the text an end indicator shows: the host's own where it gives a string for it, '' for none
export const endIndicatorText = (context, end, searching) => {
    const key = searching ? 'searching' : end
    return (context && typeof context[key] == 'string') ? context[key] : END_INDICATOR_TEXT[key]
}

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

    const text = (context && typeof context.text == 'string') ? context.text : 'searching…'

    if (text === '') return null

    return <div data-type='placeholder' style={defaultStyles}>{text}</div>

}

const endIndicatorStyles = {
    color: 'gray',
    fontSize: 'small',
    padding: '4px',
    boxSizing: 'border-box' as const,
    textAlign: 'center' as const,
}

// in a horizontal list the indicator stands along the viewport's left or right edge, and reads down it
const horizontalEndIndicatorStyles = {
    ...endIndicatorStyles,
    writingMode: 'vertical-rl' as const,
}

// The end indicator the scroller shows when the host supplies none. It stands on the viewport's edge at an end of
// the data, outside the scrolled content, and takes no size of its own. context is the host's
// operations.endIndicatorContext, passed untouched: context.start, context.end and context.searching replace the
// default texts, and '' shows none. end is 'start' or 'end'; searching is true while the host is being asked there.
export const DefaultEndIndicator = ({ context, end, searching, orientation }) => {

    const text = endIndicatorText(context, end, searching)

    if (text === '') return null

    return <div data-type='end-indicator' style={(orientation == 'horizontal') ? horizontalEndIndicatorStyles : endIndicatorStyles}>{text}</div>

}
