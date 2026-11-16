// utilities.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

// ============================[ utilities ]============================

// The scroller's own ids: a string that opens and closes with `_~_`. They are kept for cells the scroller places
// itself, so a host id in this form is refused wherever an id is checked.
const RESERVED_ID_PATTERN = /^_~_[\s\S]*_~_$/

export const isReservedID = (referenceID) => (typeof referenceID == 'string') && RESERVED_ID_PATTERN.test(referenceID)

export const isValidID = (referenceID) => {
    return ((typeof referenceID == 'number') && Number.isFinite(referenceID) || 
        ((typeof referenceID == 'string')  && (referenceID !== '') && !isReservedID(referenceID)) )
}

export const errorMessage = (error) => {
    return (error instanceof Error)?error.message:String(error)
}

// Every report the scroller makes goes through here. The host's callback is read at call time, and one that throws
// must not take the scroller down with it. A host that gives no callback for the channel hears the report in the
// console, named by the scroller: an error on console.error, a warning or a failed batch on console.warn.
// callbacksRef is the component's holder, which carries the scroller's name beside the callbacks.
const report = (channel, callbacksRef, payload) => {

    const callback = callbacksRef.current?.[channel]

    if (!callback) {

        const
            name = callbacksRef.scrollerName,
            line = `react-super-simple-scroller${name ? ` (${name})` : ''}: ${payload.source}: ${payload.message}`

        if (channel == 'error') console.error(line, payload)
        else console.warn(line, payload)

        return

    }

    try {
        callback(payload)
    } catch (e) {
        console.error(e)
    }

}

export const reportError = (callbacksRef, source, message, args = [], extra = {}) => {

    report('error', callbacksRef, {source, message, arguments: args, ...extra, timestamp: Date.now()})

}

export const reportWarning = (callbacksRef, source, message, args = [], extra = {}) => {

    report('warning', callbacksRef, {source, message, arguments: args, ...extra, timestamp: Date.now()})

}

// failed has its own payload: the ids of the cellPacks cut from a batch longer than was asked for
export const reportFailed = (callbacksRef, source, message, excessList) => {

    report('failed', callbacksRef, {source, message, excessList, timestamp: Date.now()})

}

export const baseCradleActual = {
    cellsPerBand:null,
    totalBands:0,
    forwardBands:0,
    backwardBands:0,
    forwardCells:0,
    backwardCells:0,
    totalCells:0,    
}

// a length the scroller can lay out with
export const isSize = (value) => (typeof value == 'number') && Number.isFinite(value) && (value >= 0)

const SIZE_MESSAGE = 'must be a finite number, not below zero'

export const DEFAULT_SPACING = {cradleMargin: [0, 0], bandPadding: [0, 0], cellGap: 0}

// Every spacing value is optional: an absent one is 0 and reports nothing. A present value that is not a
// size is a problem, and the last good value stands in for it.
export const validateSpacing = (spacing, lastGood = DEFAULT_SPACING) => {

    const problems = []

    if (spacing == null) spacing = {}

    if (typeof spacing != 'object') {

        problems.push({property: 'spacing', value: spacing, used: lastGood,
            message: 'must be an object; the last good values are used'})

        return {value: lastGood, problems}

    }

    const size = (property, value, used) => {

        if (value == null) return 0

        if (isSize(value)) return value

        problems.push({property, value, used, message: `${SIZE_MESSAGE}; the last good value is used`})

        return used

    }

    const pair = (property) => {

        const 
            value = spacing[property],
            used = lastGood[property]

        if (value == null) return [0, 0]

        if (!Array.isArray(value)) {

            problems.push({property, value, used, message: 'must be an array of two numbers; the last good values are used'})

            return used

        }

        return [size(`${property}[0]`, value[0], used[0]), size(`${property}[1]`, value[1], used[1])]

    }

    return {
        value: {
            cradleMargin: pair('cradleMargin'),
            bandPadding: pair('bandPadding'),
            cellGap: size('cellGap', spacing.cellGap, lastGood.cellGap),
        },
        problems,
    }

}

export const ORIENTATIONS = ['vertical', 'horizontal']
export const LAYOUTS = ['uniform', 'variable']

// orientation and layout are optional, and the first of each pair is the default: an absent one (undefined or null)
// is the default and reports nothing. Any other value is a problem, and the last good value stands in for it; at
// mount that is the default. Case is not folded: 'Vertical' is not one of the two.
export const validateOption = (property, value, options, lastGood) => {

    const used = lastGood ?? options[0]

    if (value == null) return {value: options[0], problems: []}

    if (options.includes(value)) return {value, problems: []}

    return {
        value: used,
        problems: [{property, value, used, message: `must be '${options[0]}' or '${options[1]}'; '${used}' is used`}],
    }

}

const CELL_DIMENSIONS = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']

// The fields an orientation and layout read: the two the cradle divides by (cells across a band, bands along
// the viewport), and those that only size a cell's container. A uniform layout never reads the minimum along
// the axis.
export const cellDimensionsReadSet = (orientation, layout) => {

    const 
        vertical = (orientation != 'horizontal'),
        uniform = (layout != 'variable'),
        across = vertical ? 'minWidth' : 'minHeight',
        along = vertical ? (uniform ? 'maxHeight' : 'minHeight') : (uniform ? 'maxWidth' : 'minWidth'),
        unread = uniform ? (vertical ? 'minHeight' : 'minWidth') : null

    return {
        divides: [across, along],
        reads: CELL_DIMENSIONS.filter((property) => property !== unread),
    }

}

// cellDimensions is required, but a layout does not read every field (a uniform vertical list never reads
// minHeight), so an absent field it does not read passes through and reports nothing. An absent field it
// reads is a problem, as is a present field that is not a size and a 0 the cradle divides by; the last good
// value stands in for each. There is no default: with no good value yet the field is left out, and the
// scroller lays out nothing until one arrives. A value whose four fields, once checked, all match the last good
// value returns that value, so neither a rejected change nor an equal one in a new object changes anything
// downstream; any other valid value is returned as given. orientation and layout are the checked values.
export const validateCellDimensions = (cellDimensions, lastGood = null, orientation = 'vertical', layout = 'uniform') => {

    const problems = []

    if ((cellDimensions == null) || (typeof cellDimensions != 'object')) {

        const used = (lastGood && CELL_DIMENSIONS.some((property) => lastGood[property] != null)) ? lastGood : undefined

        problems.push({property: 'cellDimensions', value: cellDimensions, used,
            message: `is required: an object of minWidth, maxWidth, minHeight and maxHeight; ${(used === undefined)
                ? 'there is no good value to use yet' : 'the last good value is used'}`})

        return {value: lastGood ?? {}, problems}

    }

    const {divides, reads} = cellDimensionsReadSet(orientation, layout)

    let value = cellDimensions

    CELL_DIMENSIONS.forEach((property) => {

        const 
            field = cellDimensions[property],
            isDivisor = divides.includes(property),
            reason = (field == null)
                ? (reads.includes(property) ? 'is required by this orientation and layout' : null)
                : !isSize(field)
                    ? SIZE_MESSAGE
                    : (isDivisor && (field === 0))
                        ? 'must be above zero: this orientation and layout divide by it'
                        : null

        if (reason === null) return

        const 
            good = lastGood?.[property],
            used = (isSize(good) && !(isDivisor && (good === 0))) ? good : undefined

        problems.push({property, value: field, used, message: (used === undefined)
            ? `${reason}; there is no good value to use yet`
            : `${reason}; the last good value is used`})

        if (value === cellDimensions) value = {...cellDimensions}

        value[property] = used

    })

    if (lastGood && CELL_DIMENSIONS.every((property) => value[property] === lastGood[property])) {

        value = lastGood

    }

    return {value, problems}

}

// A variable frame has a least and a most size on the axis and no size of its own, so a percentage in the cell has
// nothing to resolve against, and a cell that is to scroll past the most could only repeat cellDimensions. As a
// flex item along the axis the cell takes its content's size up to the frame's most; one that scrolls is held to
// it and scrolls, and one that does not is cut off at it
const setVariableFrame = (container, flexDirection) => {

    container.style.display = 'flex'
    container.style.flexDirection = flexDirection
    container.style.overflow = 'hidden'

}

export const createContainer = (id, cellDimensions,cellsPerBand, orientation, layout) => {

    const container = document.createElement('div')
    container.setAttribute('data-type','portal-container')
    container.setAttribute('data-id',id)
    container.style.position = 'relative'
    container.style.boxSizing = 'border-box'

    if (orientation == 'vertical') {

        container.style.maxWidth = cellDimensions.maxWidth + 'px'
        container.style.minWidth = cellDimensions.minWidth + 'px'
        if (layout == 'uniform') {
            container.style.height = cellDimensions.maxHeight + 'px'
        } else { // variable
            container.style.minHeight = cellDimensions.minHeight + 'px'
            container.style.maxHeight = cellDimensions.maxHeight + 'px'
            setVariableFrame(container, 'column')
        }

    } else { 'horizontal'

        container.style.maxHeight = cellDimensions.maxHeight + 'px'
        container.style.minHeight = cellDimensions.minHeight + 'px'
        if (layout == 'uniform') {
            container.style.width = cellDimensions.maxWidth + 'px'
        } else { // variable
            container.style.minWidth = cellDimensions.minWidth + 'px'
            container.style.maxWidth = cellDimensions.maxWidth + 'px'
            setVariableFrame(container, 'row')
        }

    }    
    return container
}

// operations.placeholderSpreadRatio: in variable layout a placeholder stands between the cell's min and max on the axis
export const setPlaceholderSpread = (container, cellDimensions, orientation, layout, ratio) => {

    if ((layout != 'variable') || !ratio) return

    if (orientation == 'vertical') {
        container.style.height = (cellDimensions.minHeight + ratio * (cellDimensions.maxHeight - cellDimensions.minHeight)) + 'px'
    } else {
        container.style.width = (cellDimensions.minWidth + ratio * (cellDimensions.maxWidth - cellDimensions.minWidth)) + 'px'
    }

}

// a uniform container's axis size is createContainer's own, and stays
export const clearPlaceholderSpread = (container, orientation, layout) => {

    if (layout != 'variable') return

    if (orientation == 'vertical') {
        container.style.height = ''
    } else {
        container.style.width = ''
    }

}

export const createBand = (orientation, layout, cellsPerBand, spacing, bandMutationObserver) => {

    const 
        {cellGap, bandPadding, cradleMargin} = spacing,
        band = document.createElement('div'),
        [paddingStart, paddingEnd] = bandPadding,
        [marginStart, marginEnd] = cradleMargin

    bandMutationObserver && bandMutationObserver.observe(band, {childList:true})

    band.setAttribute('data-type','band')
    band.style.display = 'grid'
    band.style.boxSizing = 'border-box'

    const style = `repeat(${cellsPerBand}, 1fr)`

    if (orientation == 'vertical') {

        band.style.gridTemplateColumns = style
        band.style.paddingTop = paddingStart + 'px'
        band.style.paddingBottom = paddingEnd + 'px'
        band.style.paddingLeft = marginStart + 'px'
        band.style.paddingRight = marginEnd + 'px'
        band.style.columnGap = cellGap + 'px'
        band.style.minWidth = '100%'
        if (layout == 'variable') {
            band.style.gridTemplateRows = 'max-content'
        }

    } else { // horizontal

        band.style.gridTemplateRows = style
        band.style.paddingLeft = paddingStart + 'px'
        band.style.paddingRight = paddingEnd + 'px'
        band.style.paddingTop = marginStart + 'px'
        band.style.paddingBottom = marginEnd + 'px'
        band.style.rowGap = cellGap + 'px'
        band.style.minHeight = '100%'
        if (layout == 'variable') {
            band.style.gridTemplateColumns = 'max-content'
        }

    }

    return band
}

// a band leaves the cradle when it is emptied, wherever it stands. The head list runs far end first and its last band
// lives in the lead headblock band; the tail list runs axis first and its first band lives in the lead tailblock band,
// so a removal there moves the next band in. The counts are read back from the lists
export const removeEmptyBands = ({headBandList, tailBandList, leadHeadblockBand, leadTailblockBand, cradleActual}) => {

    const
        headLast = headBandList.at(-1),
        tailFirst = tailBandList[0]

    for (const bandList of [headBandList, tailBandList]) {
        for (let index = bandList.length - 1; index >= 0; index--) {
            if (!bandList[index].childElementCount) bandList.splice(index, 1)[0].remove()
        }
    }

    if (headBandList.length && headBandList.at(-1) !== headLast) leadHeadblockBand?.append(headBandList.at(-1))
    if (tailBandList.length && tailBandList[0] !== tailFirst) leadTailblockBand?.append(tailBandList[0])

    cradleActual.backwardBands = headBandList.length
    cradleActual.forwardBands = tailBandList.length
    cradleActual.totalBands = headBandList.length + tailBandList.length

}

// a row of the grid can be split over the cradle's edge. The cradle's first band then holds the END of its row: its
// cells stand in the last slots of the band, and the blanks stand before them, where the rest of the row arrives.
// Every other band fills from its first slot, so a short last band has its blanks after it, and a band that is first
// and last at once reads as a last one. Nothing about the data is consulted, only where the band stands.
// The slots are derived, never kept: each pass reads the band lists as they are and writes every cell of the cradle,
// so a band that fills, or stops being first, loses its slots in the pass that sees it. A slot written when a band
// took its place and cleared somewhere else would outlive the place whenever the clearing was not reached; here there
// is no earlier state to outlive. A slot counts from the end of the band, so a cell keeps its own when cells arrive
// before it. The passes follow the cradle's child lists rather than the calls that change them: a band is filled,
// emptied or moved from many places, some of them part-way through a queued task that then waits on the host, and an
// observer's callback runs before the next paint whichever it was
export const alignCradleEnds = ({headBandList, tailBandList, cellsPerBand, orientation}) => {

    const
        bands = headBandList.concat(tailBandList),
        [slotProperty, otherProperty] = (orientation == 'vertical')
            ? ['gridColumnEnd', 'gridRowEnd']
            : ['gridRowEnd', 'gridColumnEnd'],
        firstBand = bands[0],
        firstCount = firstBand?.childElementCount ?? 0,
        isEndOfRow = (bands.length > 1) && (firstCount < cellsPerBand)

    for (const band of bands) {

        const cells = band.children

        for (let index = 0; index < cells.length; index++) {

            const
                style = cells[index].style,
                slot = (isEndOfRow && (band === firstBand)) ? String(index - firstCount) : ''

            if (style[slotProperty] != slot) style[slotProperty] = slot
            if (style[otherProperty] != '') style[otherProperty] = ''

        }

    }

}

export const observeCradleAlignment = ({blocks, readCradle}) => {

    const
        align = () => {
            const cradle = readCradle()
            for (const band of cradle.headBandList.concat(cradle.tailBandList)) observer.observe(band, {childList:true})
            alignCradleEnds(cradle)
        },
        observer = new MutationObserver(align)

    for (const block of blocks) observer.observe(block, {childList:true})

    align()

    return observer

}
