// useRemoveCells.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

/*
    TODO: 
    - consider using CSS contain
    - consider recasting forEach as for loop

*/

import React from 'react'

import { removeEmptyBands } from './utilities'

const useRemoveCells = ({

    portalIDListRef,
    cellPortalListRef,
    cellDataListRef,
    portalContainerMapRef,
    
    headBandListRef,
    tailBandListRef,
    leadHeadblockBandRef,
    leadTailblockBandRef,
    
    cradleActualRef,
    placeholdersRef,
    callbacksRef,
    
}) => {

    const removeCells = ({
        backwardCellsToRemoveCount,
        forwardCellsToRemoveCount,
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

        // a band leaves the cradle when it is emptied, never by count: a count taken from the end of a list can name
        // a band that still holds cells while an emptied band stands elsewhere in it
        removeEmptyBands({
            headBandList,
            tailBandList,
            leadHeadblockBand: leadHeadblockBandRef.current,
            leadTailblockBand: leadTailblockBandRef.current,
            cradleActual,
        })

        // a trimmed placeholder leaves the registry; it was never the host's, so removed does not name it
        const placeholderMap = placeholdersRef.current.map
        const removedList = backwardCellIDsToRemove.concat(forwardCellIDsToRemove).filter((ID) => !placeholderMap.delete(ID))

        if (callbacksRef.current.removed && removedList.length) {
            callbacksRef.current.removed(removedList)
        }

    }

    return removeCells

}

export default useRemoveCells