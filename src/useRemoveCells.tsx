// useRemoveCells.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

/*
    TODO: 
    - consider using CSS contain
    - consider recasting forEach as for loop

*/

import React from 'react'

const useRemoveCells = ({

    portalIDListRef,
    cellPortalListRef,
    cellDataListRef,
    portalContainerMapRef,
    
    headBandListRef,
    tailBandListRef,
    
    cradleActualRef,
    callbacksRef,
    
}) => {

    const removeCells = ({
        backwardCellsToRemoveCount,
        forwardCellsToRemoveCount,
        backwardBandsToRemoveCount,
        forwardBandsToRemoveCount,
    }) => {

        const
            portalIDList = portalIDListRef.current,
            cellPortalList = cellPortalListRef.current,
            cellDataList = cellDataListRef.current,
            portalContainerMap = portalContainerMapRef.current,
            headBandList = headBandListRef.current,
            tailBandList = tailBandListRef.current,
            cradleActual = cradleActualRef.current

        // --- remove cells

        const 
            forwardCellIDsToRemove = forwardCellsToRemoveCount?portalIDList.splice(-forwardCellsToRemoveCount):[],
            backwardCellIDsToRemove = portalIDList.splice(0,backwardCellsToRemoveCount)

        forwardCellIDsToRemove.forEach((ID)=>{

            const container = portalContainerMap.get(ID)

            container.remove()
            portalContainerMap.delete(ID)
        })

        backwardCellIDsToRemove.forEach((ID)=>{

            const container = portalContainerMap.get(ID)

            container.remove()
            portalContainerMap.delete(ID)
        })

        forwardCellsToRemoveCount && cellPortalList.splice(-forwardCellsToRemoveCount)
        backwardCellsToRemoveCount && cellPortalList.splice(0,backwardCellsToRemoveCount)

        forwardCellsToRemoveCount && cellDataList.splice(-forwardCellsToRemoveCount)
        backwardCellsToRemoveCount && cellDataList.splice(0,backwardCellsToRemoveCount)

        cradleActual.backwardCells -= backwardCellsToRemoveCount
        cradleActual.forwardCells -= forwardCellsToRemoveCount
        cradleActual.totalCells = cradleActual.backwardCells + cradleActual.forwardCells

        // ---remove bands
        
        const 
            headBandsToRemoveList = headBandList.splice(0,backwardBandsToRemoveCount),
            tailBandsToRemoveList = forwardBandsToRemoveCount?tailBandList.splice(-forwardBandsToRemoveCount):[]

        cradleActual.backwardBands -= backwardBandsToRemoveCount
        cradleActual.forwardBands -= forwardBandsToRemoveCount
        cradleActual.totalBands = cradleActual.backwardBands + cradleActual.forwardBands

         headBandsToRemoveList.forEach((band)=>{
             band.parentElement.removeChild(band)
         })

         tailBandsToRemoveList.forEach((band)=>{
             band.parentElement.removeChild(band)
         })

        if (callbacksRef.current.removed) { 
            const removedList = backwardCellIDsToRemove.concat(forwardCellIDsToRemove)
            if (removedList.length) {
                callbacksRef.current.removed(removedList)
            }
        }

    }

    return removeCells

}

export default useRemoveCells