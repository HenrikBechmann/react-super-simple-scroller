// useCradlePotential.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React, { useCallback } from 'react'

import { createBand } from './utilities'

const useCradlePotential = ({

    DOMManipulationQueueRef,

    orientationRef,
    layoutRef,
    spacingRef,

    seedReferenceIDRef,
    currentAxisReferenceIDRef,

    cradleActualRef,
    cellPortalListRef,
    portalIDListRef,
    portalContainerMapRef,

    headblockRef,
    headBandListRef,
    leadHeadblockBandRef,

    tailblockRef,
    tailBandListRef,
    leadTailblockBandRef,

    // callbacksRef,
    assertIntersectionsDisconnect,
    assertIntersectionsConnect,
    setPortalRenderList,
    removeCells,
    getSeed,
    fillCradle,
    updateCurrentAxisReferenceID,
    bandMutationObserverRef,

}) => {

    const applyNewCradlePotential = useCallback(async (cradlePotential) => {

        // console.log('applyNewCradlePotential to actual')

        if (seedReferenceIDRef.current == null) return

        assertIntersectionsDisconnect()

        const
            cradleActual = cradleActualRef.current,
            startingCradleActual = {...cradleActual},
            cellPortalList = cellPortalListRef.current,
            headBandList = headBandListRef.current,
            tailBandList = tailBandListRef.current,
            orientation = orientationRef.current,
            layout = layoutRef.current,
            portalIDList = portalIDListRef.current,
            headblock = headblockRef.current,
            tailblock = tailblockRef.current,
            leadHeadblockBand = leadHeadblockBandRef.current,
            leadTailblockBand = leadTailblockBandRef.current,
            bandMutationObserver = bandMutationObserverRef.current

        // 1. adjust to cradlePotential from cradleActual

        if (cradlePotential.cellsPerBand !== cradleActual.cellsPerBand) {

            // update head and tail blocks
            const newCellsPerBand = cradlePotential.cellsPerBand

            // update band layout pattern
            const updateBand = (band) => {

                const style = `repeat(${newCellsPerBand}, 1fr)`

                if (orientation == 'vertical') {

                    band.style.gridTemplateColumns = style

                } else { // horizontal

                    band.style.gridTemplateRows = style

                }

            }

            headBandList.forEach((band)=>{
                updateBand(band)
            })

            tailBandList.forEach((band)=>{
                updateBand(band)
            })

            // --------------------[ update headblock ]----------------------

            const headBandsToFit = 
                    Math.min(cradlePotential.backwardBands, 
                        Math.ceil(startingCradleActual.backwardCells/newCellsPerBand))

            let newBackwardCellCount = 0

            // add any required new bands
            if (headBandsToFit > cradleActual.backwardBands) {
                const newBandCount = headBandsToFit - cradleActual.backwardBands
                for (let count = 1; count <= newBandCount; count++) {
                    const newband = createBand(orientation, layout, newCellsPerBand,
                        spacingRef.current, bandMutationObserver)
                    if (headBandList.length === 0) {
                        leadHeadblockBand.append(newband)
                    } else { 
                        headblock.prepend(newband)
                    }
                    headBandList.unshift(newband)
                    cradleActual.backwardBands++
                }
            }

            // replace all containers in headBandsToFit
            if (headBandsToFit) {
                let backwardCellIndex = cradleActual.backwardCells - 1

                for (let bandindex = headBandList.length -1; 
                    bandindex >= (headBandList.length - headBandsToFit);
                    bandindex-- ) {

                    const
                        offset = Math.min(backwardCellIndex - (newCellsPerBand -1),0), // ragged edge
                        start = backwardCellIndex - (newCellsPerBand -1) + offset,
                        count = newCellsPerBand + offset,
                        end = start + count,
                        cellIDsToReplace = portalIDList.slice(start, end),
                        containersForReplace = []

                    backwardCellIndex -= cellIDsToReplace.length
                    newBackwardCellCount += cellIDsToReplace.length

                    cellIDsToReplace.forEach((referenceID)=>{
                        containersForReplace.push(portalContainerMapRef.current.get(referenceID))
                    })
                    const band = headBandList[bandindex]
                    band.replaceChildren(...containersForReplace)
                }
            }

            // ------------------------[ update tailblock ]--------------------------

            const
                tailBandsToFit = 
                    Math.min(cradlePotential.forwardBands, 
                        Math.ceil(startingCradleActual.forwardCells/newCellsPerBand))

            let newForwardCellCount = 0

            // add any required new bands
            if (tailBandsToFit > cradleActual.forwardBands) {
                const newBandsCount = tailBandsToFit - cradleActual.forwardBands
                for (let count = 1; count <= newBandsCount; count++) {
                    const newband = createBand(orientation, layout, newCellsPerBand,
                        spacingRef.current, bandMutationObserver)
                    if (tailBandList.length === 0) {
                        leadTailblockBand.append(newband)
                    } else { 
                        tailblock.append(newband)
                    }
                    tailBandList.push(newband)
                    cradleActual.forwardBands++
                }
            }

            // replace all containers in tailBandsToFit
            if (tailBandsToFit) {
                let forwardCellIndex = cradleActual.backwardCells

                for (let bandindex = 0; bandindex < tailBandsToFit; bandindex++ ) {
            
                    const
                        offset = Math.min(
                            (portalIDList.length -1) - (forwardCellIndex + (newCellsPerBand -1)),
                            0),
                        start = forwardCellIndex,
                        count = newCellsPerBand + offset,
                        end = start + count,
                        cellIDsToReplace = portalIDList.slice(start, end),
                        containersForReplace = []

                    forwardCellIndex += cellIDsToReplace.length
                    newForwardCellCount += cellIDsToReplace.length

                    cellIDsToReplace.forEach((referenceID)=>{
                        containersForReplace.push(portalContainerMapRef.current.get(referenceID))
                    })
                    const band = tailBandList[bandindex]
                    band.replaceChildren(...containersForReplace)
                }
            }

            // ---------------------------[ sync records and new cradleActual ]------------------------

            // const countlist = []
            // headBandListRef.current.forEach((band)=>{
            //     countlist.push(band.childElementCount)
            // })

            // pending changes:
            const 

                backwardBandsToRemoveCount = Math.max(startingCradleActual.backwardBands - headBandsToFit,0),
                backwardCellsToRemoveCount = Math.max(startingCradleActual.backwardCells - newBackwardCellCount,0),

                forwardBandsToRemoveCount = Math.max(startingCradleActual.forwardBands - tailBandsToFit,0),
                forwardCellsToRemoveCount = Math.max(startingCradleActual.forwardCells - newForwardCellCount,0)

            removeCells ({

                backwardCellsToRemoveCount,
                forwardCellsToRemoveCount,
                backwardBandsToRemoveCount,
                forwardBandsToRemoveCount,

            })

            // catch up
            Object.assign(cradleActual,{
                totalBands: cradleActual.backwardBands + cradleActual.forwardBands,
                totalCells: newBackwardCellCount + newForwardCellCount,
                cellsPerBand: newCellsPerBand
            })

            setPortalRenderList(cellPortalListRef.current)

            updateCurrentAxisReferenceID()

        } // end of change in cellsPerBand

        // 2. get cells
        if (!cellPortalList.length) {

            // restock cells

            await getSeed(seedReferenceIDRef.current)

            cradleActual.totalBands = cradleActual.backwardBands + cradleActual.forwardBands
            cradleActual.totalCells = cradleActual.backwardCells + cradleActual.forwardCells

            setTimeout(()=>{ // yield for DOM

                assertIntersectionsConnect()

            },1)

        } else {

            await fillCradle()

            cradleActual.totalBands = cradleActual.backwardBands + cradleActual.forwardBands
            cradleActual.totalCells = cradleActual.backwardCells + cradleActual.forwardCells
            setTimeout(()=>{

                assertIntersectionsConnect()

            },1)

        }

    },[])

    return applyNewCradlePotential
}

export default useCradlePotential
