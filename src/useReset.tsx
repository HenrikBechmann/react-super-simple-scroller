// useReset.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React, { useCallback } from 'react'

import { baseCradleActual, isValidID } from './utilities'

import useCells from './useCells'

const useReset = ({

    DOMManipulationQueueRef,

    cradlePotentialRef,
    portalContainerMapRef,
    portalIDListRef,
    cellPortalListRef,
    cellDataListRef,
    tailBandListRef,
    headBandListRef,
    cradleActualRef,

    setPortalRenderList,
    assertIntersectionsDisconnect,
    assertIntersectionsConnect,

    getSeed,
    callbacksRef,

    resetAxisPosition,

}) => {

    const reset = useCallback(async (seedReferenceID) => {

        // console.log('resetting with', seedReferenceID)

        const cradlePotential = cradlePotentialRef.current

        // clear out existing portals
        portalContainerMapRef.current.forEach((container) => {
            container.remove()
        })
        portalContainerMapRef.current.clear()
        portalIDListRef.current.length = 0
        cellPortalListRef.current.length = 0
        setPortalRenderList([])

        // clear existing cell and band data
        cellDataListRef.current.length = 0
        tailBandListRef.current.forEach((band)=>{
            band.remove()
        })
        tailBandListRef.current.length = 0

        const headBandListLength = headBandListRef.current.length
        headBandListRef.current.forEach((band)=>{
            band.remove()
        })
        headBandListRef.current.length = 0 // leave lead-head-band

        let noSeedReferenceID = seedReferenceID ?? true
        if (!(noSeedReferenceID === true)) noSeedReferenceID = false

        cradleActualRef.current = {
            ...baseCradleActual,
            orientation: cradlePotential.orientation,
            layout: cradlePotential.layout,
            cellsPerBand: cradlePotential.cellsPerBand,
        }

        if (noSeedReferenceID) return

        const isInvalidID = !isValidID(seedReferenceID)
        if (isInvalidID && callbacksRef.current?.error) {
            callbacksRef.current.error(
                {
                    source: 'reset',
                    message:'must be a valid seed referenceID',
                    arguments: [seedReferenceID],
                    timestamp: Date.now()
                }
            )
        }

        if (isInvalidID) return

        if (!cellPortalListRef.current.length) {
            // restock cells
            assertIntersectionsDisconnect()

            await getSeed(seedReferenceID)

            resetAxisPosition()

            setTimeout(()=>{ // yield for DOM

                assertIntersectionsConnect()

            },1)

        }
    },[])

    return reset

}

export default useReset