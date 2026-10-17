// utilities.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

// ============================[ utilities ]============================

export const isValidID = (referenceID) => {
    return ((typeof referenceID == 'number') && !Number.isNaN(referenceID) || 
        ((typeof referenceID == 'string')  && (referenceID !== '')) )
}

export const errorMessage = (error) => {
    return (error instanceof Error)?error.message:String(error)
}

// The host's callback is read at call time. One that throws must not take the scroller down with it.
export const reportError = (callbacksRef, source, message, args = [], extra = {}) => {

    const error = callbacksRef.current?.error

    if (!error) return

    try {
        error({
            source,
            message,
            arguments: args,
            ...extra,
            timestamp: Date.now()
        })
    } catch (e) {
        console.error(e)
    }

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

const CELL_DIMENSIONS = ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']

// cellDimensions is required, but a layout does not read every field (a uniform vertical list never reads
// minHeight), so an absent field passes through and reports nothing. A present field that is not a size
// is a problem, and the last good value stands in for it. There is no default: with no good value yet the
// field is left out, and the scroller lays out nothing until one arrives. A valid value is returned as
// given, and one whose good fields all match the last good value returns that value, so a rejected change
// changes nothing downstream.
export const validateCellDimensions = (cellDimensions, lastGood = null) => {

    const problems = []

    if ((cellDimensions == null) || (typeof cellDimensions != 'object')) {

        problems.push({property: 'cellDimensions', value: cellDimensions, used: lastGood,
            message: 'is required: an object of minWidth, maxWidth, minHeight and maxHeight'})

        return {value: lastGood ?? {}, problems}

    }

    let value = cellDimensions

    CELL_DIMENSIONS.forEach((property) => {

        const field = cellDimensions[property]

        if ((field == null) || isSize(field)) return

        const used = lastGood?.[property]

        problems.push({property, value: field, used, message: (used === undefined)
            ? `${SIZE_MESSAGE}; there is no good value to use yet`
            : `${SIZE_MESSAGE}; the last good value is used`})

        if (value === cellDimensions) value = {...cellDimensions}

        value[property] = used

    })

    if (problems.length && lastGood && CELL_DIMENSIONS.every((property) => value[property] === lastGood[property])) {

        value = lastGood

    }

    return {value, problems}

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
        }

    } else { 'horizontal'

        container.style.maxHeight = cellDimensions.maxHeight + 'px'
        container.style.minHeight = cellDimensions.minHeight + 'px'
        if (layout == 'uniform') {
            container.style.width = cellDimensions.maxWidth + 'px'
        } else { // variable
            container.style.minWidth = cellDimensions.minWidth + 'px'
            container.style.maxWidth = cellDimensions.maxWidth + 'px'
        }

    }    
    return container
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
