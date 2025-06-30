// useCells.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React from 'react'
import { createPortal } from 'react-dom'

import { createBand, createContainer, isValidID } from './utilities'

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

    const callbacks = callbacksRef.current ?? {}
    // call 'seed' or 'forward', never 'backward' (called by forward)
    const getCells = async (direction, seedReferenceID = null) => { // second parm for 'seed' option

        if (!tailblockRef.current || !headblockRef.current) return

        const 
            cradlePotential = cradlePotentialRef.current,
            cradleActual = cradleActualRef.current,
            fetchCells = fetchCellsRef.current


        if (!cradlePotential) return // uninitialized

        if (direction == 'seed') {

            const 
                count = 1,
                newCells = await fetchCells(direction, seedReferenceID, count)

            if (newCells.length > count) {
                const excess = newCells.splice(count)
                if (excess.length) {
                    const excessIDList = excess.map((cellPack) => cellPack.id)
                    callbacks.failed && callbacks.failed(
                        {
                            source:'fetchCells, seed',
                            message: 'too many cellPacks; excess not loaded',
                            excessList:excessIDList,
                            timestamp: Date.now()
                        }
                    )
                }
            }

            if (newCells.length) {

                const 
                    newPortalList = setSeedCell(newCells)

                cellPortalListRef.current = newPortalList

                setPortalRenderList(newPortalList)

                updateCurrentAxisReferenceID()

            }

            await getCells('forward')

        } else if (direction == 'forward') {

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
                    newCells = await fetchCells(direction, portalIDListRef.current.at(-1), count)
                }

                if (newCells.length > count) {
                    const excess = newCells.splice(count)
                    if (excess.length) {
                        const excessIDList = excess.map((cellPack) => cellPack.id)
                        callbacks.failed && callbacks.failed(
                            {
                                source:'fetchCells, forward',
                                message: 'too many cellPacks; excess not loaded',
                                excessList:excessIDList,
                                timestamp: Date.now()
                            }
                        )
                    }
                }

                if (!newCells.length) {

                    moreExpected = false

                } else {

                    const newPortalList = setForwardCells(newCells)
                    if (newPortalList.length === cellPortalListRef.current.length) { // something went wrong
                        if (callbacks.error) {
                            callbacks.error(
                                {
                                    source: 'fetchCells, forward',
                                    message:'one or more errors found in fetched cellPacks. Loading aborted',
                                    arguments: [direction, portalIDListRef.current.at(-1), count],
                                    return: newCells,
                                    timestamp: Date.now()
                                }
                            )                
                        }
                        break
                    }
                    cellPortalListRef.current = newPortalList
                    setPortalRenderList(newPortalList)

                    updateCurrentAxisReferenceID()

                }

            }

            await getCells('backward')

        } else if (direction == 'backward') {

            let moreExpected = true
            while ((cradleActual.backwardCells < cradlePotential.backwardCells) && moreExpected) {

                const 
                    count = cradlePotential.backwardCells - cradleActual.backwardCells

                let newCells = []
                if (count > 0) {
                    newCells = await fetchCells(direction, portalIDListRef.current[0], count)
                }

                if (newCells.length > count) {
                    const excess = newCells.splice(count)
                    if (excess.length) {
                        const excessIDList = excess.map((cellPack) => cellPack.id)
                        callbacks.failed && callbacks.failed(
                            {
                                source:'fetchCells, backward',
                                message: 'too many cellPacks; excess not loaded',
                                excessList:excessIDList,
                                timestamp: Date.now()
                            }
                        )
                    }
                }

                if (!newCells.length) {

                    moreExpected = false

                } else {

                    const newPortalList = setBackwardCells(newCells)
                    if (newPortalList.length === cellPortalListRef.current.length) { // something went wrong
                        if (callbacks.error) {
                            callbacks.error(
                                {
                                    source: 'fetchCells, backward',
                                    message:'one or more errors found in fetched cellPacks. Loading aborted',
                                    arguments: [direction, portalIDListRef.current[0], count],
                                    return: newCells,
                                    timestamp: Date.now()
                                }
                            )                
                        }

                        break
                    }
                    cellPortalListRef.current = newPortalList
                    setPortalRenderList(newPortalList)

                    updateCurrentAxisReferenceID()

                }

            }

        }

    }

    const setSeedCell = (newCells) => {

        const 
            cradleActual = cradleActualRef.current,
            incomingPortalList = [],
            cellPortalList = cellPortalListRef.current,
            cellPack = newCells[0]

        if (!((typeof cellPack == 'object') && React.isValidElement(cellPack.component) && isValidID(cellPack.id))) {
            if (callbacks.error) {
                callbacks.error(
                    {
                        source: 'fetchCells, seed',
                        message:'cellPack must have valid id and component; seed cellPack ignored',
                        arguments: [cellPack],
                        timestamp: Date.now()
                    }
                )
            }
            return cellPortalList
        }

        const {id, component} = cellPack

        // register cell data
        cellDataListRef.current.push(cellPack)
        portalIDListRef.current.push(id)
        const container = createContainer(
            id, cellDimensionsRef.current, cradleActual.cellsPerBand,
            orientationRef.current,layoutRef.current)
        portalContainerMapRef.current.set(id, container)
        incomingPortalList.push(createPortal(component, container, id))

        // allocate cell data
        const band = createBand(orientationRef.current, layoutRef.current, cradleActualRef.current.cellsPerBand,
            spacingRef.current, bandMutationObserverRef.current)
        tailBandListRef.current.push(band)
        leadTailblockBandRef.current.append(band) // first band belongs in lead tail band
        band.append(container)

        // update cradleActual
        cradleActual.totalBands++
        cradleActual.forwardBands++
        cradleActual.forwardCells++
        cradleActual.totalCells++    

        const newPortalList = cellPortalList.concat(incomingPortalList)
        return newPortalList
    }

    const setForwardCells = (newCells) => {

        const 
            incomingPortalList = [],
            cellPortalList = cellPortalListRef.current

        if (!newCells.every((cellPack)=>{ // if any errors found then abort loading

            const isInvalid = (!(
                (typeof cellPack == 'object') && 
                React.isValidElement(cellPack.component) && 
                isValidID(cellPack.id)))
            
            if (isInvalid && callbacks.error) {
                callbacks.error(
                    {
                        source: 'fetchCells, forward',
                        message:'cellPack must have valid id and component',
                        arguments: [cellPack],
                        timestamp: Date.now()
                    }
                )
            }

            let isDuplicate = false
            if (!isInvalid) {
                isDuplicate = portalContainerMapRef.current.has(cellPack.id)
                if (isDuplicate && callbacks.error) {
                    callbacks.error(
                        {
                            source: 'fetchCells, forward',
                            message:'fetched cellPack is a duplicate',
                            arguments: [cellPack],
                            timestamp: Date.now()
                        }
                    )                
                }
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

    const setBackwardCells = (newCells) => {

        const 
            incomingPortalList = [],
            cellPortalList = cellPortalListRef.current

        if (!newCells.every((cellPack)=>{ // if any errors found then abort loading

            const isInvalid = (!((typeof cellPack == 'object') && React.isValidElement(cellPack.component) && (isValidID(cellPack.id))))
            if (isInvalid && callbacks.error) {
                callbacks.error(
                    {
                        source: 'fetchCells, backward',
                        message:'cellPack must have valid id and component',
                        arguments: [cellPack],
                        timestamp: Date.now()
                    }
                )
            }

            let isDuplicate = false
            if (!isInvalid) {
                isDuplicate = portalContainerMapRef.current.has(cellPack.id)
                if (isDuplicate && callbacks.error) {
                    callbacks.error(
                        {
                            source: 'fetchCells, backward',
                            message:'fetched cellPack is a duplicate',
                            arguments: [cellPack],
                            timestamp: Date.now()
                        }
                    )                
                }
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
                if (firstband.childElementCount < cradleActual.cellsPerBand) {
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
