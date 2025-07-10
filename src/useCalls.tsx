// useCalls.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React, {FC} from 'react'

import { createPortal } from 'react-dom'

import { createContainer, createBand, isValidID } from './utilities'

/*
    - calls available to host
    has,
    insert,
    remove,
    move,
    replace,
    getCradleIDList,
    getCradleSpecs,
    fetchCradleCells,
    restoreScrollPositions,
    dispatchEvent,
*/

const useCalls = ({

    DOMManipulationQueueRef,

    scrollerName,

    operationsRef,

    portalIDListRef,
    cellPortalListRef,
    cellDataListRef,
    portalContainerMapRef,

    spacingRef,
    scrollTopRef,
    scrollLeftRef,
    
    viewportRef,
    headblockRef,
    tailblockRef,
    headBandListRef,
    tailBandListRef,
    leadHeadblockBandRef,

    cradleActualRef,
    cradlePotentialRef,
    cellDimensionsRef,
    viewportDimensionsRef,
    orientationRef,
    layoutRef,
    currentAxisReferenceIDRef,

    setPortalRenderList,
    updateCurrentAxisReferenceID,
    trimCradle,
    fillCradle,
    reset,
    callbacksRef,
    assertIntersectionsDisconnect,
    assertIntersectionsConnect,
    bandMutationObserverRef,

}) => {

    const callbacks = callbacksRef.current

    const DOMManipulationQueue = DOMManipulationQueueRef.current

    const insert = async (cellPack: {id:any, component:FC }, targetReferenceID: any, position: 'before' | 'after' = 'before') => {

        const doInsert = async (cellPack, targetReferenceID, position) => {

            if ( !( (typeof cellPack == 'object') && 
                    React.isValidElement(cellPack.component) && 
                    (isValidID(cellPack.id)) ) )
            {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'insert',
                            message:'insert must have a valid cellPack argument',
                            arguments: [cellPack, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (!isValidID(targetReferenceID)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'insert',
                            message:'insert targetReferenceID must be a valid ID',
                            arguments: [cellPack, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (!['before','after'].includes(position)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'insert',
                            message:'insert position must be either "before" or "after"',
                            arguments: [cellPack, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (portalContainerMapRef.current.has(cellPack.id)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'insert',
                            message:'insert error: cellPack.id is already in the cradle',
                            arguments: [cellPack, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                return false // aleady included
            }

            const targetPos = portalIDListRef.current.indexOf(targetReferenceID)

            if (targetPos === -1) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'insert',
                            message:'target id is not in the cradle',
                            arguments: [cellPack, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                return false // no target for positioning
            }

            assertIntersectionsDisconnect()

            const
                cradleActual = cradleActualRef.current,
                portalIDList = portalIDListRef.current,
                cellDataList = cellDataListRef.current,
                portalContainerMap = portalContainerMapRef.current,
                cellPortalList = cellPortalListRef.current

            // --- calculate insert position

            const insertPos = 
                (position == 'before')
                    ? targetPos
                    : targetPos + 1

            if ((targetPos) < cradleActual.backwardCells) {

                cradleActual.backwardCells++

            } else {

                cradleActual.forwardCells++

            }

            // --- insert new cell data into lists

            cellDataList.splice(insertPos, 0,cellPack)
            portalIDList.splice(insertPos, 0, cellPack.id)

            // --- create new container and portal

            const newContainer = createContainer(
                cellPack.id, 
                cellDimensionsRef.current, 
                cradleActual.cellsPerBand, 
                orientationRef.current, 
                layoutRef.current
            )
            
            portalContainerMap.set(cellPack.id, newContainer)

            const newPortal = createPortal(cellPack.component, newContainer, cellPack.id)
            
            cellPortalList.splice(insertPos, 0, newPortal)

            // --- push containers forward from insert point to make room for insert container

            const 
                { cellsPerBand } = cradleActual,
                targetContainer = portalContainerMap.get(targetReferenceID)

            if ((targetPos) <= cradleActual.backwardCells - 1) { // adjust head bands

                // --- adjust head bands

                const
                    headBandList = headBandListRef.current,
                    firstHeadbandOffset = cellsPerBand - headBandList[0].childElementCount,
                    targetHeadPos = targetPos, // to be consistent with tail procesing
                    targetBandIndex = Math.ceil(((targetHeadPos + firstHeadbandOffset) + 1)/cellsPerBand) - 1,
                    firstBand = headBandList[0]

                // create a first band if necessary to receive the outer displacement
                if (firstBand.childElementCount === cellsPerBand) { // first band is full

                    const 
                        newBand = createBand(orientationRef.current, layoutRef.current, cellsPerBand,
                            spacingRef.current, bandMutationObserverRef.current)

                    headblockRef.current.prepend(newBand)
                    headBandList.unshift(newBand)

                    cradleActual.backwardBands++
                    cradleActual.totalBands++

                }

                if (position == 'before') {
                    targetContainer.before(newContainer)                
                } else { // 'after'
                    targetContainer.after(newContainer)                
                }
                // --- shift containers

                for (let bandindex = 0; bandindex < targetBandIndex; bandindex ++ ) {
                    headBandList[bandindex].append(headBandList[bandindex + 1].firstChild)
                }

            } else { // --- adjust tail bands

                const
                    tailBandList = tailBandListRef.current,
                    firstTailbandOffset = cellsPerBand - tailBandList[0].childElementCount,
                    tailPos = portalIDList.length - cradleActual.forwardCells,
                    targetTailPos = targetPos - tailPos,
                    targetBandIndex = Math.ceil(((targetTailPos + firstTailbandOffset) + 1)/cellsPerBand) - 1,
                    lastBand = tailBandList.at(-1)

                // create a last band if necessary to receive the outer displacement
                if (lastBand.childElementCount === cellsPerBand) { // last band is full

                    const 
                        newBand = createBand(orientationRef.current, layoutRef.current, 
                            cellsPerBand,spacingRef.current, bandMutationObserverRef.current)

                    tailblockRef.current.append(newBand)
                    tailBandList.push(newBand)

                    cradleActual.forwardBands++
                    cradleActual.totalBands++

                }

                if (position == 'before') {
                    targetContainer.before(newContainer)                
                } else { // 'after'
                    targetContainer.after(newContainer)                
                }

                // --- shift containers

                for (let bandindex = tailBandList.length - 1; bandindex > targetBandIndex; bandindex--) {
                    tailBandList[bandindex].prepend(tailBandList[bandindex -1].lastChild)
                }


            } // end of adjust tail bands

            setPortalRenderList([...cellPortalListRef.current])

            trimCradle()

            setTimeout(()=>{
                assertIntersectionsConnect()
            },1)

            return true

        }


        const result = await DOMManipulationQueue.enqueue(async ()=>{

            const result = await doInsert(cellPack, targetReferenceID, position)

            updateCurrentAxisReferenceID()

            assertIntersectionsConnect()

            return result

        })

        return result

    }

    const remove = async (targetReferenceID:any) => {

        const doRemove = (targetReferenceID)=>{

            if (!isValidID(targetReferenceID)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'remove',
                            message:'must be valid target referenceID',
                            arguments: [targetReferenceID],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            const 
                targetPos = portalIDListRef.current.indexOf(targetReferenceID)

            if (targetPos === -1) {
                if (callbacks.warning) {
                    callbacks.warning(
                        {
                            source: 'remove',
                            message:'target referenceID not found',
                            arguments: [targetReferenceID],
                            timestamp: Date.now()
                        }
                    )
                }
                return false // no remove target in cradle
            }

            assertIntersectionsDisconnect()

            const
                portalIDList = portalIDListRef.current,
                cellPortalList = cellPortalListRef.current,
                cellDataList = cellDataListRef.current,
                cradleActual = cradleActualRef.current,
                { cellsPerBand } = cradleActual,
                portalContainerMap = portalContainerMapRef.current,
                targetContainer = portalContainerMap.get(targetReferenceID)

            if (targetPos < cradleActual.backwardCells) { // shift backward containers

                const
                    headBandList = headBandListRef.current,
                    firstHeadBandOffset = cellsPerBand - headBandList[0].childElementCount,
                    targetHeadPos = targetPos,
                    targetBandIndex = Math.ceil((targetHeadPos + firstHeadBandOffset + 1)/cellsPerBand) - 1,
                    targetBand = headBandList[targetBandIndex]

                for (let bandIndex = targetBandIndex; bandIndex > 0; bandIndex--) {
                    headBandList[bandIndex].prepend(headBandList[bandIndex - 1].lastChild)
                }

                const workingBand = headBandList[0]
                if (workingBand.childElementCount === 0) {

                    workingBand.remove()
                    headBandList.unShift()
                    cradleActual.backwardBands--
                    cradleActual.totalBands--

                }

                cradleActual.backwardCells--

            } else { // shift forward containers

                const
                    tailBandList = tailBandListRef.current,
                    firstTailBandOffset = cellsPerBand - tailBandList[0].childElementCount,
                    tailPos = portalIDList.length - cradleActual.forwardCells,
                    targetTailPos = targetPos - tailPos,
                    targetBandIndex = Math.ceil((targetTailPos + firstTailBandOffset + 1)/cellsPerBand) - 1

                for (let bandIndex = targetBandIndex; bandIndex < tailBandList.length - 1; bandIndex++) {
                    tailBandList[bandIndex].append(tailBandList[bandIndex + 1].firstChild)
                }

                const lastTailBand = tailBandList.at(-1)
                if (lastTailBand.childElementCount === 0) {

                    lastTailBand.remove()
                    tailBandList.pop()
                    cradleActual.forwardBands--
                    cradleActual.totalBands--

                }

                cradleActual.forwardCells--

            }

            targetContainer.remove()

            portalContainerMap.delete(targetReferenceID)
            portalIDList.splice(targetPos, 1)
            cellPortalList.splice(targetPos, 1)
            cellDataList.splice(targetPos, 1)

            cradleActual.totalCells--

            setPortalRenderList([...cellPortalListRef.current])

            return true

        }

        const result = await DOMManipulationQueue.enqueue(async () => {

            const result = await doRemove(targetReferenceID)

            if (result) {

                await fillCradle()

                setTimeout(()=>{
                    assertIntersectionsConnect()
                },1)

                updateCurrentAxisReferenceID()

                callbacks.removed && callbacks.removed([targetReferenceID])
                
            } else {

                assertIntersectionsConnect()

            }

            return result

        })

        return result

    }

    const move = async (sourceReferenceID: any, targetReferenceID: any, position: 'before' | 'after' = 'before') => {

        const doMove = async (sourceReferenceID, targetReferenceID, position) => {

        // parameter validation

            if (!isValidID(sourceReferenceID) || !isValidID(targetReferenceID)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'move',
                            message:'both source and target must be valid referenceIDs',
                            arguments: [sourceReferenceID, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (!['before','after'].includes(position)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'move',
                            message:'position must be "before" or "after"',
                            arguments: [sourceReferenceID, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (sourceReferenceID === targetReferenceID) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'move',
                            message:'source and target referenceIDs cannot be equal',
                            arguments: [sourceReferenceID, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            const
                portalContainerMap = portalContainerMapRef.current

            if (!portalContainerMap.has(sourceReferenceID)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'move',
                            message:'source referenceID not found in cradle',
                            arguments: [sourceReferenceID, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (!portalContainerMap.has(targetReferenceID)) {
                if (callbacks.warning) {
                    callbacks.warning(
                        {
                            source: 'move',
                            message:'targetReferenceID not found in cradle. sourceReferenceID being removed',
                            arguments: [sourceReferenceID, targetReferenceID, position],
                            timestamp: Date.now()
                        }
                    )
                }
                remove(sourceReferenceID)
                return true
            }

            assertIntersectionsDisconnect()

            // common data

            const 
                cradleActual = cradleActualRef.current,
                { cellsPerBand } = cradleActual,

                portalIDList = portalIDListRef.current,
                cellDataList = cellDataListRef.current,
                cellPortalList = cellPortalListRef.current,

                sourcePos = portalIDList.indexOf(sourceReferenceID),
                targetPos = portalIDList.indexOf(targetReferenceID),
                tailPos = portalIDList.length - cradleActual.forwardCells,
                sourceLocation = 's' + 
                    ((sourcePos < tailPos)
                        ? 'h'
                        : 't'),
                targetLocation = 't' + 
                    ((targetPos < tailPos)
                        ? 'h'
                        : 't'),
                moveSpread = Math.abs(sourcePos - targetPos),

                sourceContainer = portalContainerMap.get(sourceReferenceID),
                targetContainer = portalContainerMap.get(targetReferenceID)

            // avoid unnecessary processing

            if (moveSpread === 1) {
                if (((sourcePos > targetPos) && (position == 'after')) ||  
                    ((targetPos > sourcePos) && (position == 'before'))) {
                    return true // move would have no effect
                }
            }

            // processing control

            const comboLocation = sourceLocation + targetLocation

            // move container according to comboLocation
            if (comboLocation == 'shth') { // all in head

                const
                    headBandList = headBandListRef.current,
                    firstHeadBandOffset = cellsPerBand - headBandList[0].childElementCount,
                    sourceHeadPos = sourcePos, // for consistency with tail processing
                    targetHeadPos = targetPos,
                    sourceBandIndex = Math.ceil((sourceHeadPos + firstHeadBandOffset + 1)/cellsPerBand) - 1,
                    targetBandIndex = Math.ceil((targetHeadPos + firstHeadBandOffset + 1)/cellsPerBand) - 1

                if (position == 'after') {
                    targetContainer.after(sourceContainer)
                } else { // 'before'
                    targetContainer.before(sourceContainer)
                }
                
                if (sourceBandIndex < targetBandIndex) {

                    for (let bandIndex = targetBandIndex; bandIndex > sourceBandIndex; bandIndex--) {
                        headBandList[bandIndex - 1].append(headBandList[bandIndex].firstChild)
                    }

                } else if (sourceBandIndex > targetBandIndex ) {

                    for (let bandIndex = targetBandIndex; bandIndex < sourceBandIndex; bandIndex++) {
                        headBandList[bandIndex + 1].prepend(headBandList[bandIndex].lastChild)
                    }

                } // else changed in current band only

            } else if (comboLocation == 'sttt') { // all in tail

                const
                    tailBandList = tailBandListRef.current,
                    firstTailBandOffset = cellsPerBand - tailBandList[0].childElementCount,
                    sourceTailPos = sourcePos - tailPos,
                    targetTailPos = targetPos - tailPos,
                    sourceBandIndex = Math.ceil((sourceTailPos + firstTailBandOffset + 1)/cellsPerBand) - 1,
                    targetBandIndex = Math.ceil((targetTailPos + firstTailBandOffset + 1)/cellsPerBand) - 1

                if (position == 'after') {
                    targetContainer.after(sourceContainer)
                } else { // 'before'
                    targetContainer.before(sourceContainer)
                }

                if (sourceBandIndex > targetBandIndex) {

                    for (let bandIndex = targetBandIndex; bandIndex < sourceBandIndex; bandIndex++) {
                        tailBandList[bandIndex + 1].prepend(tailBandList[bandIndex].lastChild)
                    }

                } else if (sourceBandIndex < targetBandIndex ) {

                    for (let bandIndex = targetBandIndex; bandIndex > sourceBandIndex; bandIndex--) {
                        tailBandList[bandIndex - 1].append(tailBandList[bandIndex].firstChild)
                    }

                } // else changed in current band only

            } else if (sourceLocation == 'sh') { // sourceLocation -- head; targetLocation == 'tt' -- tail

                const
                    headBandList = headBandListRef.current,
                    firstHeadBandOffset = cellsPerBand - headBandList[0].childElementCount,
                    sourceHeadPos = sourcePos,
                    sourceBandIndex = Math.ceil((sourceHeadPos + firstHeadBandOffset + 1)/cellsPerBand) - 1,

                    tailBandList = tailBandListRef.current,
                    targetTailPos = targetPos - tailPos,
                    targetBandIndex = Math.ceil((targetTailPos + 1)/cellsPerBand) - 1

                if (position == 'after') {
                    targetContainer.after(sourceContainer)
                } else { // 'before'
                    targetContainer.before(sourceContainer)
                }

                // process head band for removal of a container
                for (let bandIndex = sourceBandIndex; bandIndex > 0; bandIndex--) {
                    headBandList[bandIndex].prepend(headBandList[bandIndex - 1].lastChild)
                }

                // remove empty band if necessary
                const workingHeadBand = headBandList[0]
                if (workingHeadBand.childElementCount === 0) {
                    workingHeadBand.remove()
                    headBandList.shift()
                    cradleActual.backwardBands--
                    cradleActual.totalBands--
                }

                // process tail band for addition of a container
                for (let bandIndex = targetBandIndex; bandIndex < tailBandList.length - 1; bandIndex++) {
                    tailBandList[bandIndex + 1].prepend(tailBandList[bandIndex].lastChild)
                }

                // add new band if necessary
                const workingTailBand = tailBandList.at(-1)
                if (workingTailBand.childElementCount > cellsPerBand) {
                    const newBand = createBand(orientationRef.current, layoutRef.current, cellsPerBand,
                        spacingRef.current, bandMutationObserverRef.current)
                    newBand.prepend(workingTailBand.lastChild)
                    tailblockRef.current.append(newBand)
                    tailBandList.push(newBand)
                    cradleActual.forwardBands++
                    cradleActual.totalBands++
                }

                cradleActual.backwardCells--
                cradleActual.forwardCells++

            } else { // sourceLocation == 'st' -- tail ; targetLocation == 'th' -- head
                // move sourceContainer, then expand head and compact tail
                const
                    headBandList = headBandListRef.current,
                    firstHeadBandOffset = cellsPerBand - headBandList[0].childElementCount,
                    targetHeadPos = targetPos,
                    targetBandIndex = Math.ceil((targetHeadPos + firstHeadBandOffset + 1)/cellsPerBand) - 1,

                    tailBandList = tailBandListRef.current,
                    sourceTailPos = sourcePos - tailPos,
                    sourceBandIndex = Math.ceil((sourceTailPos + 1)/cellsPerBand) - 1

                if (position == 'after') {
                    targetContainer.after(sourceContainer)
                } else { // 'before'
                    targetContainer.before(sourceContainer)
                }

                // process tail band for removal of a container
                for (let bandIndex = sourceBandIndex; bandIndex < tailBandList.length - 1; bandIndex++) {
                    tailBandList[bandIndex].append(tailBandList[bandIndex + 1].firstChild)
                }

                // remove empty from tail band if necessary
                const workingTailBand = tailBandList.at(-1)
                if (workingTailBand.childElementCount === 0) {
                    workingTailBand.remove()
                    tailBandList.pop()
                    cradleActual.forwardBands--
                    cradleActual.totalBands--
                }

                // process head band for addition of a container
                for (let bandIndex = targetBandIndex; bandIndex > 0; bandIndex--) {
                    headBandList[bandIndex - 1].prepend(headBandList[bandIndex].lastChild)
                }

                // add new band if necessary
                const workingHeadBand = headBandList[0]
                if (workingHeadBand.childElementCount > cellsPerBand) {
                    const newBand = createBand(orientationRef.current, layoutRef.current, cellsPerBand,
                        spacingRef.current, bandMutationObserverRef.current)
                    newBand.append(workingHeadBand.firstChild)
                    headblockRef.current.prepend(newBand)
                    headBandList.unshift(newBand)
                    cradleActual.backwardBands++
                    cradleActual.totalBands++
                }

                cradleActual.backwardCells++
                cradleActual.forwardCells--

            }

            // update internal structures
            const insertPos = 
                (position == 'before')
                    ? targetPos
                    : targetPos + 1
                    
            if (sourcePos > targetPos) {

                const 
                    [id] = portalIDList.splice(sourcePos,1),
                    [portal] = cellPortalList.splice(sourcePos,1),
                    [data] = cellDataList.splice(sourcePos,1)
                
                portalIDList.splice(insertPos, 0, id)
                cellPortalList.splice(insertPos, 0, portal)
                cellDataList.splice(insertPos, 0, data)

            } else { // sourcePos < targetPos

                const 
                    [id] = portalIDList.slice(sourcePos, sourcePos + 1),
                    [portal] = cellPortalList.slice(sourcePos, sourcePos + 1),
                    [data] = cellDataList.slice(sourcePos, sourcePos + 1)

                portalIDList.splice(insertPos, 0, id)
                cellPortalList.splice(insertPos, 0, portal)
                cellDataList.splice(insertPos, 0, data)

                portalIDList.splice(sourcePos,1)
                cellPortalList.splice(sourcePos,1)
                cellDataList.splice(sourcePos,1)

            }

            trimCradle()

            // update presentation
            setPortalRenderList([...cellPortalListRef.current])

            return true

        }

        const result = await DOMManipulationQueue.enqueue(async () => {

            const result = await doMove(sourceReferenceID, targetReferenceID, position)

            if (result) {

                await fillCradle()

                setTimeout(()=>{
                    assertIntersectionsConnect()
                },1)

                updateCurrentAxisReferenceID()

            } else {

                assertIntersectionsConnect()

            }
        
            return result

        })

        return result

    }

    const getCradleIDList = () => {

        return [...portalIDListRef.current]

    }

    const getCradleSpecs = () => {

        const specs = {
            cradleActual: {
                scrollerName,
                firstReferenceID: portalIDListRef.current[0],
                lastReferenceID: portalIDListRef.current.at(-1),
                axisReferenceID: currentAxisReferenceIDRef.current, 
                ...cradleActualRef.current
            },
            cradlePotential: {
                cellDimensions:{...cellDimensionsRef.current},
                spacing:{...spacingRef.current},
                viewportDimensions: {...viewportDimensionsRef.current},
                ...cradlePotentialRef.current
            }
        }

        return specs

    }

    const fetchCradleCells = async (seedReferenceID?:any) => {

        if (seedReferenceID != null) {

            await DOMManipulationQueue.enqueue(async () => {
                await reset(seedReferenceID)
            })

        } else {

            await DOMManipulationQueue.enqueue(async () => {

                assertIntersectionsDisconnect()

                await fillCradle()

                setTimeout(()=>{
                    assertIntersectionsConnect()
                },1)
            })
        }

        // assertIntersectionsConnect()

    }

    const restoreScrollPositions = () => {

        const event = new Event('rs3attached')

        assertIntersectionsDisconnect()

        viewportRef.current.scrollTo(scrollLeftRef.current, scrollTopRef.current)

        setTimeout(()=>{
            assertIntersectionsConnect()
        },1)

        operationsRef.current.dispatchAttachedEvents && portalContainerMapRef.current.forEach((container) => {
            container.firstChild && container.firstChild.dispatchEvent(event)
        })

    }

    const has = (referenceID) => {
        if (!isValidID(referenceID )) {
            if (callbacks.error) {
                callbacks.error(
                    {
                        source: 'has',
                        message:'must be a valid referenceID',
                        arguments: [referenceID],
                        timestamp: Date.now()
                    }
                )
            }
            return false
        }
        return portalContainerMapRef.current.has(referenceID)
    }

    const replace = async (referenceID, cellPack = {id:null, component:null, default:true}) => {

        const doReplace = (referenceID, cellPack) => {

            const
                portalIDList = portalIDListRef.current,
                cellPortalList = cellPortalListRef.current,
                cellDataList = cellDataListRef.current,
                portalContainerMap = portalContainerMapRef.current,
                cradlePotential = cradlePotentialRef.current,
                cellDimensions = cellDimensionsRef.current

            if (!isValidID(referenceID )) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'replace',
                            message:'must be a valid referenceID',
                            arguments: [referenceID, cellPack],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (!isValidID(cellPack.id)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'replace',
                            message:'must be a valid cellPack.id',
                            arguments: [referenceID, cellPack],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (!React.isValidElement(cellPack.component)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'replace',
                            message:'must be a valid cellPack.component',
                            arguments: [referenceID, cellPack],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (!portalContainerMap.has(referenceID)) {
                if (callbacks.warning) {
                    callbacks.warning(
                        {
                            source: 'replace',
                            message:'referenceID not found',
                            arguments: [referenceID, cellPack],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            if (portalContainerMap.has(cellPack.id)) {
                if (callbacks.error) {
                    callbacks.error(
                        {
                            source: 'replace',
                            message:'cellPack.id already in cradle',
                            arguments: [referenceID, cellPack],
                            timestamp: Date.now()
                        }
                    )
                }
                return false
            }

            const 
                {cellsPerBand, orientation, layout} = cradlePotential,
                newContainer = createContainer(cellPack.id, cellDimensions, cellsPerBand, orientation, layout),
                oldContainer = portalContainerMap.get(referenceID),
                newPortal = createPortal(cellPack.component, newContainer, cellPack.id),
                newID = cellPack.id

            const arrayIndex = portalIDList.findIndex((value) => referenceID === value)

            portalIDList[arrayIndex] = newID
            cellPortalList[arrayIndex] = newPortal
            cellDataList[arrayIndex] = cellPack
            portalContainerMap.delete(referenceID)
            portalContainerMap.set(newID, newContainer)

            oldContainer.before(newContainer)
            oldContainer.remove()

            setPortalRenderList([...cellPortalList])

            return true

        }

        const result = await DOMManipulationQueue.enqueue(async () => {
            
            const result = await doReplace(referenceID, cellPack)

            updateCurrentAxisReferenceID()

            assertIntersectionsConnect()

            return result

        })

        return result

    }

    const dispatchEvent = (referenceID:any, event) => {

        if (!isValidID(referenceID )) {
            if (callbacks.error) {
                callbacks.error(
                    {
                        source: 'dispatchEvent',
                        message:'must be a valid referenceID',
                        arguments: [referenceID, event],
                        timestamp: Date.now()
                    }
                )
            }
            return false
        }

        if (!portalContainerMapRef.current.has(referenceID)) {
            if (callbacks.warning) {
                callbacks.warning(
                    {
                        source: 'dispatchEvent',
                        message:'referenceID not found in cradle',
                        arguments: [referenceID, event],
                        timestamp: Date.now()
                    }
                )
            }
            return false
        }

        let isValidEvent = (event instanceof Event)

        if (isValidEvent) {

            if (event.isTrusted) { // not synthetic
                isValidEvent = false
            }
        }

        if (!isValidEvent) {

            if (callbacks.error) {
                callbacks.error(
                    {
                        source: 'dispatchEvent',
                        message:'event must be a synthetic event',
                        arguments: [referenceID, event],
                        timestamp: Date.now()
                    }
                )
            }
            return false
        }

        const targetContainer = portalContainerMapRef.current.get(referenceID)

        targetContainer.firstChild && targetContainer.firstChild.dispatchEvent(event)

        return true

    }

    const calls = {
        has,
        insert,
        remove,
        move,
        replace,
        getCradleIDList,
        getCradleSpecs,
        fetchCradleCells,
        restoreScrollPositions,
        dispatchEvent,
    }

    return calls

}

export default useCalls