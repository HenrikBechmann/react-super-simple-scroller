// utilities.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

// ============================[ utilities ]============================

export const isValidID = (referenceID) => {
    return ((typeof referenceID == 'number') && !Number.isNaN(referenceID)) || (typeof referenceID == 'string')
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

export const getCradleMarginsFromSpacing = (spacing) => {

    let cradleMargin = spacing.cradleMargin
    cradleMargin = cradleMargin ?? []
    let [cradleMarginStart, cradleMarginEnd] = cradleMargin
    cradleMarginStart  = cradleMarginStart ?? 0
    cradleMarginEnd = cradleMarginEnd ?? 0

    return [cradleMarginStart, cradleMarginEnd]

}

export const getBandPaddingFromSpacing = (spacing) => {

    let bandPadding = spacing.bandPadding
    bandPadding = bandPadding ?? []
    let [bandPaddingStart, bandPaddingEnd] = bandPadding
    bandPaddingStart  = bandPaddingStart ?? 0
    bandPaddingEnd = bandPaddingEnd ?? 0

    return [bandPaddingStart, bandPaddingEnd]

}

export const getCellGapFromSpacing = (spacing) => {
    let gap = spacing.cellGap
    gap = gap ?? 0
    return gap
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
