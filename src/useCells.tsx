// useCells.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React from 'react'
import { createPortal } from 'react-dom'

import { createBand, createContainer, isValidID, reportError, reportFailed, errorMessage } from './utilities'

const useCells = ({

    scrollerName,

    orientationRef,
    layoutRef,
    spacingRef,

    cradlePotentialRef,
    cradleActualRef,

    cellPortalListRef,
    portalIDListRef,
    cellDataListRef,
    portalContainerMapRef,

    cellDimensionsRef,

    tailblockRef,
    tailBandListRef,
    leadTailblockBandRef,
    headblockRef,
    headBandListRef,
    leadHeadblockBandRef,

    setPortalRenderList,
    fetchCellsRef,
    updateCurrentAxisReferenceID,
    callbacksRef,
    bandMutationObserverRef,

}) => {

    // A host fetch that rejects, or answers with anything but an array, is reported and read as an empty
    // batch: the pass ends there and the next scroll asks again. An empty array is the end of the data.
    const fetchBatch = async (fetchCells, startCode, referenceID, count) => {

        let cells

        try {

            cells = await fetchCells(startCode, referenceID, count)

        } catch (error) {

            leadTailblockBandRef.current && reportError(callbacksRef, `fetchCells, ${startCode}`, 
                `fetchCells rejected: ${errorMessage(error)}`, [startCode, referenceID, count])

            return []

        }

        if (!Array.isArray(cells)) {

            leadTailblockBandRef.current && reportError(callbacksRef, `fetchCells, ${startCode}`, 
                'fetchCells must return an array of cellPacks', [startCode, referenceID, count], {return: cells})

            return []

        }

        return cells

    }

    // call 'at' or 'after', never 'before' (called by after)
    const getCells = async (startCode, seedReferenceID = null) => { // second parm for 'at' option

        if (!tailblockRef.current || !headblockRef.current || !leadTailblockBandRef.current) return

        const 
            cradlePotential = cradlePotentialRef.current,
            cradleActual = cradleActualRef.current,
            fetchCells = fetchCellsRef.current


        if (!cradlePotential) return // uninitialized

        if (startCode == 'at') {

            const
                count = 1,
                newCells = await fetchBatch(fetchCells, startCode, seedReferenceID, count)

            // Re-check: scroller may have been reset/unmounted while fetchCells was in-flight
            if (!leadTailblockBandRef.current || cradleActualRef.current !== cradleActual) return

            if (newCells.length > count) {
                const excess = newCells.splice(count)
                if (excess.length) {
                    const excessIDList = excess.map((cellPack) => cellPack?.id)
                    reportFailed(callbacksRef, 'fetchCells, at', 'too many cellPacks; excess not loaded', excessIDList)
                }
            }

            if (newCells.length) {

                const newPortalList = setForwardCells(newCells, 'fetchCells, at')
                if (newPortalList.length === cellPortalListRef.current.length) { // something went wrong
                    reportError(callbacksRef, 'fetchCells, at', 'one or more errors found in fetched cellPacks. Loading aborted', [startCode, seedReferenceID, count], {return: newCells})
                    return
                }
                cellPortalListRef.current = newPortalList
                setPortalRenderList(newPortalList)

                updateCurrentAxisReferenceID()

            }

            // nothing at the reference: there is no row to fetch after or before from
            if (!cellPortalListRef.current.length) return

            await getCells('after')

        } else if (startCode == 'after') {

            const tailBandList = tailBandListRef.current

            let offset = 0
            if (tailBandList.length > 1) {
                offset = cradleActual.cellsPerBand - tailBandList[0].childElementCount
            }

            let moreExpected = true
            while ((cradleActual.forwardCells < (cradlePotential.forwardCells - offset)) && moreExpected) {

                const 
                    count = cradlePotential.forwardCells - cradleActual.forwardCells

                let newCells = []
                if (count > 0) {
                    newCells = await fetchBatch(fetchCells, startCode, portalIDListRef.current.at(-1), count)
                }

                if (!leadTailblockBandRef.current || cradleActualRef.current !== cradleActual) return

                if (newCells.length > count) {
                    const excess = newCells.splice(count)
                    if (excess.length) {
                        const excessIDList = excess.map((cellPack) => cellPack?.id)
                        reportFailed(callbacksRef, 'fetchCells, after', 'too many cellPacks; excess not loaded', excessIDList)
                    }
                }

                if (!newCells.length) {

                    moreExpected = false

                } else {

                    const newPortalList = setForwardCells(newCells)
                    if (newPortalList.length === cellPortalListRef.current.length) { // something went wrong
                        reportError(callbacksRef, 'fetchCells, after', 'one or more errors found in fetched cellPacks. Loading aborted', [startCode, portalIDListRef.current.at(-1), count], {return: newCells})
                        break
                    }
                    cellPortalListRef.current = newPortalList
                    setPortalRenderList(newPortalList)

                    updateCurrentAxisReferenceID()

                }

            }

            await getCells('before')

        } else if (startCode == 'before') {

            let moreExpected = true
            while ((cradleActual.backwardCells < cradlePotential.backwardCells) && moreExpected) {

                const 
                    count = cradlePotential.backwardCells - cradleActual.backwardCells

                let newCells = []
                if (count > 0) {
                    newCells = await fetchBatch(fetchCells, startCode, portalIDListRef.current[0], count)
                }

                if (!leadTailblockBandRef.current || cradleActualRef.current !== cradleActual) return

                if (newCells.length > count) {
                    const excess = newCells.splice(count)
                    if (excess.length) {
                        const excessIDList = excess.map((cellPack) => cellPack?.id)
                        reportFailed(callbacksRef, 'fetchCells, before', 'too many cellPacks; excess not loaded', excessIDList)
                    }
                }

                if (!newCells.length) {

                    moreExpected = false

                } else {

                    const newPortalList = setBackwardCells(newCells)
                    if (newPortalList.length === cellPortalListRef.current.length) { // something went wrong
                        reportError(callbacksRef, 'fetchCells, before', 'one or more errors found in fetched cellPacks. Loading aborted', [startCode, portalIDListRef.current[0], count], {return: newCells})

                        break
                    }
                    cellPortalListRef.current = newPortalList
                    setPortalRenderList(newPortalList)

                    updateCurrentAxisReferenceID()

                }

            }

        }

    }

    // The checks in setForwardCells and setBackwardCells catch an id the cradle already holds, not one the
    // batch itself repeats. A repeat is reported and skipped, and the rest of the batch loads.
    const dropRepeats = (newCells, source) => {

        const seen = new Set()

        return newCells.filter((cellPack) => {

            const id = cellPack?.id

            if (!isValidID(id)) return true // reported by the checks that follow

            if (!seen.has(id)) {
                seen.add(id)
                return true
            }

            reportError(callbacksRef, source,
                'duplicate id within the batch; the repeat is skipped', [cellPack], {return: newCells})

            return false

        })

    }

    const setForwardCells = (newCells, source = 'fetchCells, after') => {

        newCells = dropRepeats(newCells, source)

        const 
            incomingPortalList = [],
            cellPortalList = cellPortalListRef.current

        if (!newCells.every((cellPack)=>{ // if any errors found then abort loading

            const isInvalid = (!(
                (cellPack !== null) &&
                (typeof cellPack == 'object') && 
                React.isValidElement(cellPack.component) && 
                isValidID(cellPack.id)))
            
            if (isInvalid) reportError(callbacksRef, source, 'cellPack must have valid id and component', [cellPack])

            let isDuplicate = false
            if (!isInvalid) {
                isDuplicate = portalContainerMapRef.current.has(cellPack.id)
                if (isDuplicate) reportError(callbacksRef, source, 'fetched cellPack is a duplicate', [cellPack])
            }

            return (!isDuplicate && !isInvalid)
        })) {
            return cellPortalList
        }

        const cradleActual = cradleActualRef.current
        newCells.forEach((cellPack) => {

            // register cell data
            cellDataListRef.current.push(cellPack)
            const {id, component} = cellPack
            portalIDListRef.current.push(id)
            const container = createContainer(id, cellDimensionsRef.current, cradleActual.cellsPerBand,
                orientationRef.current,layoutRef.current)
            portalContainerMapRef.current.set(id, container)
            incomingPortalList.push(createPortal(component, container, id))

            // allocate cell data
            let band
            const latestband = tailBandListRef.current.at(-1)

            if (latestband && latestband.childElementCount < cradleActual.cellsPerBand) {

                band = latestband

            } else {

                band = createBand(orientationRef.current, layoutRef.current, cradleActual.cellsPerBand,
                    spacingRef.current, bandMutationObserverRef.current)

                if (tailBandListRef.current.length == 0) {

                    leadTailblockBandRef.current.append(band)

                } else {

                    tailblockRef.current.append(band)

                }

                tailBandListRef.current.push(band)
                cradleActual.totalBands++
                cradleActual.forwardBands++
            }

            band.append(container)
            cradleActual.forwardCells++
            cradleActual.totalCells++

        })

        const newPortalList = cellPortalList.concat(incomingPortalList)

        return newPortalList

    }

    const setBackwardCells = (newCells, source = 'fetchCells, before') => {

        newCells = dropRepeats(newCells, source)

        const 
            incomingPortalList = [],
            cellPortalList = cellPortalListRef.current

        if (!newCells.every((cellPack)=>{ // if any errors found then abort loading

            const isInvalid = (!((cellPack !== null) && (typeof cellPack == 'object') && React.isValidElement(cellPack.component) && (isValidID(cellPack.id))))
            if (isInvalid) reportError(callbacksRef, source, 'cellPack must have valid id and component', [cellPack])

            let isDuplicate = false
            if (!isInvalid) {
                isDuplicate = portalContainerMapRef.current.has(cellPack.id)
                if (isDuplicate) reportError(callbacksRef, source, 'fetched cellPack is a duplicate', [cellPack])
            }

            return (!isDuplicate && !isInvalid)
        })) {
            return cellPortalList
        }

        const cradleActual = cradleActualRef.current

        newCells.forEach((cellPack) => {

            // register cell data
            cellDataListRef.current.unshift(cellPack)
            const {id, component} = cellPack
            portalIDListRef.current.unshift(id)

            const container = createContainer(id, cellDimensionsRef.current, cradleActualRef.current.cellsPerBand,
                orientationRef.current, layoutRef.current)
            
            portalContainerMapRef.current.set(id, container)
            incomingPortalList.unshift(createPortal(component, container, id))

            // allocate cell data
            let band
            const latestband = headBandListRef.current[0]

            if (!latestband) {
                const firstband = tailBandListRef.current[0] // there may be room in the tail firstband
                if (firstband && firstband.childElementCount < cradleActual.cellsPerBand) {
                    band = firstband
                    band.prepend(container)
                    cradleActual.forwardCells++
                    cradleActual.totalCells++
                    return
                }
            }

            if (latestband && (latestband.childElementCount < cradleActual.cellsPerBand)) {

                band = latestband

            } else {

                band = createBand(orientationRef.current, layoutRef.current, cradleActual.cellsPerBand,
                    spacingRef.current, bandMutationObserverRef.current)

                if (headBandListRef.current.length == 0) {

                    leadHeadblockBandRef.current.append(band)

                } else {

                    headblockRef.current.prepend(band)

                }

                headBandListRef.current.unshift(band)
                cradleActual.totalBands++
                cradleActual.backwardBands++
            }

            band.prepend(container)
            cradleActual.backwardCells++
            cradleActual.totalCells++

        })

        const newPortalList = incomingPortalList.concat(cellPortalList)
        return newPortalList

    }

    return getCells

}

export default useCells
