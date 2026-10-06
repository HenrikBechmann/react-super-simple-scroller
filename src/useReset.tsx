// useReset.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React, { useCallback } from 'react'

import { baseCradleActual, isValidID, reportError } from './utilities'

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
    heldSeedReferenceIDRef,

    resetAxisPosition,

}) => {

    // Resolves true when the cradle was reset as asked, and false for a reset that returned early.

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
        // compensating for an ordering defect rather than fixing one. Do not treat as settled.
        // The early return is no longer silent: the host is told, and the seed it asked for is held
        // for that effect, which seeds from it in place of the mount-time seed.
        if (!cradlePotential) {

            if (seedReferenceID != null) {

                heldSeedReferenceIDRef.current = seedReferenceID

                reportError(callbacksRef, 'reset', 
                    'called before layout, with no cradle to reset; the seed referenceID is held for the reset that follows layout',
                    [seedReferenceID])

            }

            return false

        }

        let noSeedReferenceID = seedReferenceID ?? true
        if (!(noSeedReferenceID === true)) noSeedReferenceID = false

        cradleActualRef.current = {
            ...baseCradleActual,
            orientation: cradlePotential.orientation,
            layout: cradlePotential.layout,
            cellsPerBand: cradlePotential.cellsPerBand,
        }

        if (noSeedReferenceID) return false

        if (seedReferenceID === '') return true // the cradle is cleared, as asked

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

        if (isInvalidID) return false

        if (!cellPortalListRef.current.length) {
            // restock cells
            assertIntersectionsDisconnect()

            try {

                await getSeed(seedReferenceID)

                // console.log('[RESET] reset complete after getSeed, cellPortalList.length:', cellPortalListRef.current.length)

                resetAxisPosition(true) // freshReset: place axis 1px inside viewport to avoid spurious forward shift

            } finally {

                setTimeout(()=>{ // yield for DOM

                    assertIntersectionsConnect()

                },1)

            }

        }

        return true

    },[])

    return reset

}

export default useReset