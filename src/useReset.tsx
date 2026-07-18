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

        // console.log('[RESET] reset called, seedReferenceID:', seedReferenceID,
        //     'current cellPortalList.length:', cellPortalListRef.current.length)

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

        // SUSPICIOUS — provenance unknown; found uncommitted in the working tree 2026-07-18, already
        // live in dist. Guards the cradleActual assignment below, which would otherwise throw on
        // cradlePotential.orientation before it is computed; the throw lands inside a
        // DOMManipulationQueue slot and surfaces only as a rejected promise. The retry is assumed to
        // come from the cradlePotential effect (ReactSuperSimpleScroller ~917). Suspect it may be
        // compensating for an ordering defect rather than fixing one: this is the third silent
        // early-return in reset that empties the cradle and seeds nothing, with no error callback
        // and no host notification. Do not treat as settled.
        if (!cradlePotential) return

        let noSeedReferenceID = seedReferenceID ?? true
        if (!(noSeedReferenceID === true)) noSeedReferenceID = false

        cradleActualRef.current = {
            ...baseCradleActual,
            orientation: cradlePotential.orientation,
            layout: cradlePotential.layout,
            cellsPerBand: cradlePotential.cellsPerBand,
        }

        if (noSeedReferenceID) return

        if (seedReferenceID === '') return

        const isInvalidID = !isValidID(seedReferenceID)
        if (isInvalidID && callbacksRef.current.error) {
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

            // console.log('[RESET] reset complete after getSeed, cellPortalList.length:', cellPortalListRef.current.length)

            resetAxisPosition(true) // freshReset: place axis 1px inside viewport to avoid spurious forward shift

            setTimeout(()=>{ // yield for DOM

                assertIntersectionsConnect()

            },1)

        }
    },[])

    return reset

}

export default useReset