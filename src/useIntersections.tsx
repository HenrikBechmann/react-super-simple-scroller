// useIntersections.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React, { useCallback, useRef } from 'react'

// A trackpad fling keeps sending wheel events for seconds after the fingers lift. A hold at an end of
// the data that is released inside that stream lets the rest of it push the list out again, and the
// list is put back a second and a third time, so that hold also waits for the wheel to go quiet
const END_OF_DATA_QUIET_WINDOW = 300

const useIntersections = ({

    scrollerName,

    // constants
    STANDARD_SCROLL_MOMENTUM_FADE,
    AXIS_START_POSITION,

    DOMManipulationQueueRef,

    orientationRef,

    // DOM elements
    viewportRef,
    headblockRef,
    leadHeadblockBandRef,
    headblockOverflowTriggerRef,
    tailblockRef,
    tailblockOverflowTriggerRef,
    leadTailblockBandRef,

    // state data
    cradleActualRef,
    cradlePotentialRef,
    headBandListRef,
    tailBandListRef,
    intersectionsMapRef,
    scrollTopRef,
    scrollLeftRef,
    axisPositionRef,
    portalIDListRef,

    // control data
    immediateIsScrollingRef,
    immediateStopScrollingRef,
    restoreScrollingTimeoutIDRef,

    // methods
    // callbacksRef,
    setAxisPosition,
    assertIntersectionsDisconnect,
    assertIntersectionsConnect,
    fillCradle,
    updateCurrentAxisReferenceID,
    trimCradle,

}) => {

    const DOMManipulationQueue = DOMManipulationQueueRef.current

    const lastPositionRecoveryRef = useRef(0)

    const holdRef = useRef({viewport:null, onWheel:null, endOfData:null, endCellID:null, cradle:null, isRecovery:false, lastWheelTime:0, count:0})

    // -------------------------[ intersection observations controller ]-------------------------

    const evaluateIntersections = useCallback( async (source) => {

        if (!viewportRef.current) return

        if (intersectionsMapRef.current.size < 7) return // incomplete initialization

        if (!portalIDListRef.current.length) return

        const 
            intersectionsMap = intersectionsMapRef.current,

            leadHeadblockBand = intersectionsMap.get('lead-headblock-band'),
            headblockOverflowTrigger = intersectionsMap.get('headblock-overflow-trigger'),
            leadHeadblockBandBackwardTrigger = intersectionsMap.get('lead-headblock-band-backward-trigger'),

            leadTailblockBand = intersectionsMap.get('lead-tailblock-band'),
            leadTailblockBandEndTrigger = intersectionsMap.get('lead-tailblock-band-end-trigger'),
            leadTailblockBandForwardTrigger = intersectionsMap.get('lead-tailblock-band-forward-trigger'),
            tailblockOverflowTrigger = intersectionsMap.get('tailblock-overflow-trigger')

        // --- complete overshoot - defensive

        const 
            allAreBefore =
                (
                    (headblockOverflowTrigger.rs3position == 'before') &&
                    (leadHeadblockBand.rs3position == 'before') && 
                    (leadHeadblockBandBackwardTrigger.rs3position == 'before') &&

                    (leadTailblockBand.rs3position == 'before') &&
                    (leadTailblockBandForwardTrigger.rs3position == 'before') &&
                    (leadTailblockBandEndTrigger.rs3position == 'before') &&
                    (tailblockOverflowTrigger.rs3position == 'before')
                ),
            allAreAfter = 
                (
                    (headblockOverflowTrigger.rs3position == 'after') &&
                    (leadHeadblockBand.rs3position == 'after') && 
                    (leadHeadblockBandBackwardTrigger.rs3position == 'after') &&

                    (leadTailblockBand.rs3position == 'after') &&
                    (leadTailblockBandForwardTrigger.rs3position == 'after') &&
                    (leadTailblockBandEndTrigger.rs3position == 'after') &&
                    (tailblockOverflowTrigger.rs3position == 'after')
                )

        if (allAreBefore || allAreAfter) {

            const now = Date.now()
            if (now - lastPositionRecoveryRef.current < 200) return
            lastPositionRecoveryRef.current = now

            console.log('WARNING: POSITION RECOVERY', 'from all', allAreBefore?'before':'after', 'on', source)

            assertIntersectionsDisconnect()

            if (immediateIsScrollingRef.current) {

                holdScrolling(null, true)
                scrollTopRef.current = viewportRef.current.scrollTop
                scrollLeftRef.current = viewportRef.current.scrollLeft

            }

            if (orientationRef.current == 'vertical') {

                immediateStopScrollingRef.current = false
                scrollTopRef.current = AXIS_START_POSITION
                scrollLeftRef.current = viewportRef.current.scrollLeft
                setAxisPosition(0, AXIS_START_POSITION + 1, 'outside')
                viewportRef.current.scrollTo(viewportRef.current.scrollLeft, AXIS_START_POSITION)

            } else { // 'horizontal'

                immediateStopScrollingRef.current = false
                scrollLeftRef.current = AXIS_START_POSITION
                scrollTopRef.current = viewportRef.current.scrollTop
                setAxisPosition(AXIS_START_POSITION + 1, 0, 'outside')
                viewportRef.current.scrollTo(AXIS_START_POSITION, viewportRef.current.scrollTop)

            }

            setTimeout(()=>{ // yield for DOM

                assertIntersectionsConnect()

            },1)

            return
        }

        // --- oversize band vs viewport

        if (leadHeadblockBand.rs3position == 'in' || leadTailblockBand.rs3position == 'in') {

            const 
                allTriggersAreOutside = (
                    (headblockOverflowTrigger.rs3position != 'in') &&
                    (leadHeadblockBandBackwardTrigger.rs3position != 'in') &&
                    (tailblockOverflowTrigger.rs3position != 'in') &&
                    (leadTailblockBandForwardTrigger.rs3position != 'in') &&
                    (leadTailblockBandEndTrigger.rs3position != 'in')
                )
            if ( allTriggersAreOutside  && (
                ((leadHeadblockBand.rs3position == 'in') && (leadTailblockBand.rs3position != 'in'))
                || ((leadHeadblockBand.rs3position != 'in') && (leadTailblockBand.rs3position == 'in'))
            )) { // one of the leadbands is oversized

                // console.log('OVERSIZE BAND')

                return // ... so do nothing

            }
        }

        // --- head overflow
        
        if ( headblockOverflowTrigger.rs3position != 'before' ) {

            // console.log('HEAD OVERFLOW')

            assertIntersectionsDisconnect()

            let headHold = 0

            if (immediateIsScrollingRef.current) {

                headHold = holdScrolling()
                scrollTopRef.current = viewportRef.current.scrollTop
                scrollLeftRef.current = viewportRef.current.scrollLeft

            }

            const executeHeadOverflow = async () => {
    
                assertIntersectionsDisconnect()

                adjustForHeadOverflow()

                await fillCradle()

                // asked for cells before the first one and none came: the hold begun above, if it is
                // still the one in force, is at the head of the data
                if (headHold && holdRef.current.viewport && (holdRef.current.count == headHold) && !holdRef.current.isRecovery &&
                    isCradleShortAt('head')) {

                    markEndOfData('head')

                }

                setTimeout(()=>{ // yield for DOM

                    assertIntersectionsConnect()

                },1)                
            }

            await DOMManipulationQueue.enqueue(executeHeadOverflow)

            return

        }

        // --- tail overflow

        if (( tailblockOverflowTrigger.rs3position != 'after' ) && headBandListRef.current.length ) {

            // console.log('TAIL OVERFLOW')

            assertIntersectionsDisconnect()

            if (immediateIsScrollingRef.current) {

                holdScrolling()
                scrollTopRef.current = viewportRef.current.scrollTop
                scrollLeftRef.current - viewportRef.current.scrollLeft

            } 

            const executeTailOverflow = async () => {

                assertIntersectionsDisconnect()

                await adjustForTailOverflow() // now async; fillCradle moved inside

                // await fillCradle() // moved into adjustForTailOverflow

                setTimeout(()=>{ // yield for DOM

                    assertIntersectionsConnect()

                },1)

            }

            await DOMManipulationQueue.enqueue(executeTailOverflow)

            return

        }

        // shift axis backward

        if ( leadHeadblockBandBackwardTrigger.rs3position == 'in' ) {

            assertIntersectionsDisconnect()

            const headBandList = tailBandListRef.current

            let bandCount = 0
            if (orientationRef.current == 'vertical') {

                const axisGap = leadHeadblockBandBackwardTrigger.boundingClientRect.bottom -
                    leadHeadblockBandBackwardTrigger.rs3rootBounds.top

                if (headBandList.length > 0) {
                    let bandIndex = headBandList.length - 1
                    let bandHeightSpan = headBandList[bandIndex].offsetHeight
                    let nextHeight = 0
                    while ((bandHeightSpan + nextHeight) < axisGap) {
                        bandHeightSpan += nextHeight
                        bandIndex--
                        if (bandIndex < 0) break
                        nextHeight = headBandList[bandIndex].offsetHeight
                    }
                    bandCount = headBandList.length - Math.max(0, bandIndex)
                }

            } else { // 'horizontal'

                const axisGap = leadHeadblockBandBackwardTrigger.boundingClientRect.right -
                    leadHeadblockBandBackwardTrigger.rs3rootBounds.left

                if (headBandList.length > 0) {
                    let bandIndex = headBandList.length - 1
                    let bandWidthSpan = headBandList[bandIndex].offsetWidth
                    let nextWidth = 0
                    while ((bandWidthSpan + nextWidth) < axisGap) {
                        bandWidthSpan += nextWidth
                        bandIndex--
                        if (bandIndex < 0) break
                        nextWidth = headBandList[bandIndex].offsetWidth
                    }
                    bandCount = headBandList.length - Math.max(0, bandIndex)
                }
            }

            const count = bandCount

            // console.log('SHIFT AXIS BACKWARD', count)

            const executeShiftBackward = async () => {

                assertIntersectionsDisconnect()

                shiftAxis('backward',count) // axis backward, bands forward

                await fillCradle()
                
                setTimeout(()=>{ // yield for DOM

                    assertIntersectionsConnect()

                },1)

            } 

            await DOMManipulationQueue.enqueue(executeShiftBackward)

            return
        }

        // --- shift axis forward

        if ( leadTailblockBandForwardTrigger.rs3position == 'before' ) {

            assertIntersectionsDisconnect()

            const tailBandList = tailBandListRef.current

            let bandCount = 0
            if (!tailBandList.length) return

            if (orientationRef.current == 'vertical') {
                const axisGap = leadTailblockBandForwardTrigger.rs3rootBounds.top - 
                    leadTailblockBandForwardTrigger.boundingClientRect.bottom
                    
                let bandIndex = tailBandList.length - 1
                let bandHeightSpan = tailBandList[bandIndex].offsetHeight
                let nextHeight = 0
                while ((bandHeightSpan + nextHeight) < axisGap) {
                    bandHeightSpan += nextHeight
                    bandIndex--
                    if (bandIndex < 0) break
                    nextHeight = tailBandList[bandIndex].offsetHeight
                }
                bandCount = tailBandList.length - Math.max(0, bandIndex)

            } else { // 'horizontal'

                const axisGap = leadTailblockBandForwardTrigger.rs3rootBounds.left -
                    leadTailblockBandForwardTrigger.boundingClientRect.right

                let bandIndex = tailBandList.length - 1
                let bandWidthSpan = tailBandList[bandIndex].offsetWidth
                let nextWidth = 0

                while ((bandWidthSpan + nextWidth) < axisGap) {
                    bandWidthSpan += nextWidth
                    bandIndex--
                    if (bandIndex < 0) break
                    nextWidth = tailBandList[bandIndex].offsetWidth
                }
                bandCount = tailBandList.length - Math.max(0, bandIndex)
            }

            const axisshiftcount = bandCount

            // console.log('SHIFT AXIS FORWARD', axisshiftcount)

            const executeShiftForward = async () => {

                assertIntersectionsDisconnect()

                shiftAxis('forward', axisshiftcount) // axis forward, bands backward

                await fillCradle()

                setTimeout(()=>{ // yield for DOM

                    assertIntersectionsConnect()

                },1)

            }

            await DOMManipulationQueue.enqueue(executeShiftForward)

            return

        }

    },[])

    // -------------------------[ scrolling hold ]-------------------------

    // The viewport is pinned where it is and cannot be scrolled until the hold is released.
    // overflow:hidden is what stops the browser's own momentum. A browser scrolls on its
    // compositor first, so a list held by scrollTo alone is painted displaced, then put back,
    // on every momentum event (Safari shakes and can lose its place).
    // A hold is released STANDARD_SCROLL_MOMENTUM_FADE after it began. One at an end of the data
    // (endOfData 'head' or 'tail') is also kept until the wheel has been quiet for
    // END_OF_DATA_QUIET_WINDOW, and is released at once by a wheel away from that end.
    // An end of the data is only what the host last answered. The wait for quiet ends when the host's
    // fetchCradleCells has reset the cradle or brought cells to the held end, or a push that never pauses
    // would stay held in front of cells it could scroll into.
    // A hold begun by position recovery is never one at an end of the data, whatever follows it: the
    // cradle has just been put back, and a release before the fixed time lets the scroll outrun it again
    // inside the recovery's own guard, which strands the list out of view.
    // A held viewport cannot take the wheel, and a browser may then hand it to a scrollable ancestor
    // in spite of overscroll-behavior, so the wheel along the list's axis is cancelled where it can be.
    // A cancelled wheel scrolls nothing, so the wheel being cancelled is what holds the list, and
    // overflow is restored. A wheel gesture that meets an overflow:hidden list can belong to the
    // ancestor from then on (Safari): the scroll back out of an end, or what is left of a fling when
    // a hold lets go, would then move what is behind the list. A wheel that cannot be cancelled hides
    // the list again
    const holdScrolling = (endOfData = null, isRecovery = false) => {

        const
            hold = holdRef.current,
            viewport = viewportRef.current

        viewport.style.overflow = 'hidden'
        immediateStopScrollingRef.current = true
        isRecovery && (hold.isRecovery = true)
        hold.endOfData = null
        endOfData && !hold.isRecovery && markEndOfData(endOfData)
        hold.count++

        if (!hold.viewport) { // the wheel is listened to for the life of a hold only

            hold.viewport = viewport
            hold.onWheel = onHoldWheel
            hold.lastWheelTime = 0
            viewport.addEventListener('wheel', onHoldWheel, {passive:false})

        }

        clearTimeout(restoreScrollingTimeoutIDRef.current)
        restoreScrollingTimeoutIDRef.current = setTimeout(releaseHoldWhenQuiet,STANDARD_SCROLL_MOMENTUM_FADE)

        return hold.count

    }

    const onHoldWheel = (event) => {

        const
            hold = holdRef.current,
            vertical = (orientationRef.current == 'vertical'),
            delta = vertical?event.deltaY:event.deltaX,
            crossDelta = vertical?event.deltaX:event.deltaY

        if (!delta || event.ctrlKey) return // a cross-axis gesture, or a zoom, is not input to this list's scroll

        if (hold.endOfData && ((delta > 0) != (hold.endOfData == 'tail'))) { // away from the held end

            releaseHold()
            return

        }

        hold.lastWheelTime = performance.now()

        if (event.cancelable && (Math.abs(delta) >= Math.abs(crossDelta))) {

            event.preventDefault()
            hold.viewport.style.overflow = 'auto'

        } else {

            hold.viewport.style.overflow = 'hidden'

        }

    }

    const releaseHoldWhenQuiet = () => {

        const
            hold = holdRef.current,
            quietTime = performance.now() - hold.lastWheelTime

        if (hold.endOfData && viewportRef.current && (quietTime < END_OF_DATA_QUIET_WINDOW) && isEndAsMarked()) {

            restoreScrollingTimeoutIDRef.current =
                setTimeout(releaseHoldWhenQuiet,END_OF_DATA_QUIET_WINDOW - quietTime)
            return

        }

        releaseHold()

    }

    const endCellID = (end) => (end == 'head')?portalIDListRef.current[0]:portalIDListRef.current.at(-1)

    const markEndOfData = (end) => {

        const hold = holdRef.current

        hold.endOfData = end
        hold.endCellID = endCellID(end)
        hold.cradle = cradleActualRef.current

    }

    // a reset starts a new cradle, and cells that arrive at the held end change which cell it ends on
    const isEndAsMarked = () => {

        const hold = holdRef.current

        return (cradleActualRef.current === hold.cradle) && (endCellID(hold.endOfData) === hold.endCellID)

    }

    // fewer cells at an end of the cradle than it can hold there, counted as the fill counts them
    const isCradleShortAt = (end) => {

        const
            cradleActual = cradleActualRef.current,
            cradlePotential = cradlePotentialRef.current

        if (end == 'head') return !!cradlePotential.backwardCells && !cradleActual.backwardCells

        const
            tailBandList = tailBandListRef.current,
            firstBandShortfall = (tailBandList.length > 1)?cradleActual.cellsPerBand - tailBandList[0].childElementCount:0

        return cradleActual.forwardCells < (cradlePotential.forwardCells - firstBandShortfall)

    }

    const releaseHold = () => {

        const hold = holdRef.current

        clearTimeout(restoreScrollingTimeoutIDRef.current)
        immediateStopScrollingRef.current = false
        viewportRef.current && (viewportRef.current.style.overflow = 'auto')
        hold.viewport?.removeEventListener('wheel', hold.onWheel)
        hold.viewport = null
        hold.endOfData = null
        hold.cradle = null
        hold.isRecovery = false

    }

    // -------------------------[ intersection observations support ]-------------------------

    const adjustForHeadOverflow = () => {

        const
            cradleActual = cradleActualRef.current

        if (!cradleActual.backwardBands) { // reposition

            if (orientationRef.current == 'vertical') {

                scrollTopRef.current = AXIS_START_POSITION
                viewportRef.current.scrollTo(scrollLeftRef.current,AXIS_START_POSITION)
                setAxisPosition(0,AXIS_START_POSITION - 1, 'head overflow')

            } else { // 'horizontal'

                viewportRef.current.scrollTo(AXIS_START_POSITION, scrollTopRef.current)
                scrollLeftRef.current = AXIS_START_POSITION
                setAxisPosition(AXIS_START_POSITION - 1,0, 'head overflow')

            }

        } else { // reposition axis to top

            // console.log('SHIFT AXIS BACKWARD (from head overflow)')

            shiftAxis('backward',cradleActual.backwardBands)

        }

        cradleActual.totalCells = cradleActual.forwardCells + cradleActual.backwardCells
        cradleActual.totalBands = cradleActual.forwardBands + cradleActual.backwardBands

    }

    const adjustForTailOverflow = async () => {

        // Original approach: nudge axis down to make room, then fillCradle added cells into
        // the newly created scrollable space. Replaced by the approach below.
        //
        // const tailTriggerRect = tailblockOverflowTriggerRef.current.getBoundingClientRect()
        // const viewportRect = viewportRef.current.getBoundingClientRect()
        // if (orientationRef.current == 'vertical') {
        //     const
        //         gap = viewportRect.bottom - tailTriggerRect.top,
        //         viewportHeight = viewportRect.height,
        //         cradleHeight = headblockRef.current.offsetHeight + tailblockRef.current.offsetHeight + 2,
        //         available = cradleHeight - (viewportHeight - gap),
        //         adjustment = Math.min(gap, available) + 3,
        //         currentAxisY = axisPositionRef.current.y
        //     adjustment && setAxisPosition(0, currentAxisY + adjustment, 'tail overflow')
        // } else {
        //     const
        //         gap = viewportRect.right - tailTriggerRect.left,
        //         viewportWidth = viewportRect.width,
        //         cradleWidth = headblockRef.current.offsetWidth + tailblockRef.current.offsetWidth + 2,
        //         available = cradleWidth - (viewportWidth - gap),
        //         adjustment = Math.min(gap, available) + 3,
        //         currentAxisX = axisPositionRef.current.x
        //     adjustment && setAxisPosition(currentAxisX + adjustment, 0)
        // }

        // New approach: fill first. If new cells arrive, the tailblock grows naturally and
        // the trigger returns to 'after' on its own — no axis nudge needed. If no cells
        // arrive (end of available data), snap scroll to the true boundary so the last item
        // sits cleanly at the viewport bottom, and stop momentum. When the user scrolls
        // forward again, fillCradle retries; if new data has arrived it resumes normally.

        const forwardCellsBefore = cradleActualRef.current.forwardCells

        await fillCradle()

        if (cradleActualRef.current.forwardCells > forwardCellsBefore) {

            // New cells arrived — tailblock grew, trigger returns to 'after' naturally.
            return

        }

        // No new cells: snap to boundary (last item bottom = viewport bottom).
        // axis + tailHeight - vpDim is invariant under axis shifts, so this is always correct.
        const isH = orientationRef.current === 'horizontal'
        const axis = isH ? axisPositionRef.current.x : axisPositionRef.current.y
        const tailDim = isH ? tailblockRef.current.offsetWidth : tailblockRef.current.offsetHeight
        const vpDim = isH ? viewportRef.current.clientWidth : viewportRef.current.clientHeight
        const boundary = axis + tailDim - vpDim

        if (isH) {
            scrollLeftRef.current = boundary
            viewportRef.current.scrollTo(boundary, viewportRef.current.scrollTop)
        } else {
            scrollTopRef.current = boundary
            viewportRef.current.scrollTo(viewportRef.current.scrollLeft, boundary)
        }

        // still short of its potential after the fill: the host was asked for more and had none, which is
        // the end of the data. A full cradle that the scroll has outrun is not
        holdScrolling(isCradleShortAt('tail')?'tail':null)

    }

    // assumes count is correct
    const shiftAxis = (direction, axisShiftCount) => {

        const 
            cradleActual = cradleActualRef.current,
            cradlePotential = cradlePotentialRef.current,
            headblock = headblockRef.current,
            backwardBandList = headBandListRef.current,
            tailblock = tailblockRef.current,
            forwardBandList = tailBandListRef.current,
            leadHeadblockBand = leadHeadblockBandRef.current,
            leadTailblockBand = leadTailblockBandRef.current

        if (direction == 'forward') {

            // moves axis forward,  by moving bands from forwardBands to backwardBands
            for (let count = 1; count <= axisShiftCount; count++ ) {

                const 
                    forwardFirstBand = forwardBandList.shift(), // get the band to move
                    forwardNextBand = forwardBandList[0], // next in line, to replace moved band
                    backwardFirstBand = backwardBandList.at(-1) // for insert moved band before

                backwardBandList.push(forwardFirstBand) // add moved band

                const bandContainerCount = forwardFirstBand.childElementCount
                cradleActual.forwardBands--
                cradleActual.forwardCells -= bandContainerCount
                cradleActual.backwardBands++
                cradleActual.backwardCells += bandContainerCount

                // move axis forward
                backwardFirstBand && leadHeadblockBand.before(backwardFirstBand) // move down to make room 
                // move band from backward to forward, axis backward
                leadHeadblockBand.append(forwardFirstBand) // replace with new band

                forwardNextBand && leadTailblockBand.append(forwardNextBand) // replace moved band with next band

                if (orientationRef.current == 'vertical') {

                    const 
                        currentPx = axisPositionRef.current.y,
                        movedHeight = forwardFirstBand.offsetHeight

                    setAxisPosition(0,currentPx + movedHeight, 'forward shift') // PIXEL

                } else { // horizontal}

                    const 
                        currentPx = axisPositionRef.current.x,
                        movedWidth = forwardFirstBand.offsetWidth

                    setAxisPosition(currentPx + movedWidth,0) 

                }

            }

            // Clear any end-alignment left over from a previous tail position.
            // 2026-05-21: disabled ragged-start (right-alignment of partial leading bands) — caused
            // intermittent blank cell at column 1. Band boundary fell mid-logical-row when seed position
            // was non-zero, making a partial head band appear to need ragged alignment even though
            // the data starts at item 0. Left-alignment is correct; column position has no semantic meaning.
            // Previous code (partial branch): gridColumn = n - count + i + 1
            const newLeadingHeadBand = backwardBandList.at(-1)
            if (newLeadingHeadBand) {
                const prop = orientationRef.current === 'horizontal' ? 'gridRow' : 'gridColumn'
                // const count = newLeadingHeadBand.childElementCount
                // const n = cradleActual.cellsPerBand
                // if (count > 0 && count < n) {
                //     Array.from(newLeadingHeadBand.children).forEach((child, i) => {
                //         (child as HTMLElement).style[prop] = String(n - count + i + 1)
                //     })
                // } else {
                Array.from(newLeadingHeadBand.children).forEach((child) => {
                    (child as HTMLElement).style[prop] = ''
                })
                // }
            }

        } else { // 'backward'

            if (!backwardBandList.length) { // beginning of available cradle bands

                if (orientationRef.current == 'vertical') {
                    setAxisPosition(0,viewportRef.current.scrollTop - 1) // PIXEL
                } else {
                    setAxisPosition(viewportRef.current.scrollLeft - 1, 0) 
                }

                return
            }

            for (let count = axisShiftCount; count >=1; count--) {
                const
                    backwardFirstBand = backwardBandList.pop(), // get the first band to move
                    backwardNextBand = backwardBandList.at(-1), // next in line, for shift to replace first
                    forwardFirstBand = forwardBandList[0] // for insert moved band after

                // Clear any end-alignment from a previous tail position; partial-band pre-positioning disabled.
                // 2026-05-21: disabled partial-band branch (ragged-start pre-positioning) — was setting
                // gridColumn = n - cellCount + i + 1 on partial bands before moving them into view,
                // to avoid a visible shuffle. No longer needed since ragged-start is disabled throughout.
                {
                    // const cellCount = backwardFirstBand.childElementCount
                    // const n = cradleActual.cellsPerBand
                    const prop = orientationRef.current === 'horizontal' ? 'gridRow' : 'gridColumn'
                    // if (cellCount > 0 && cellCount < n) {
                    //     Array.from(backwardFirstBand.children).forEach((child, i) => {
                    //         (child as HTMLElement).style[prop] = String(n - cellCount + i + 1)
                    //     })
                    // } else {
                    Array.from(backwardFirstBand.children).forEach((child) => {
                        (child as HTMLElement).style[prop] = ''
                    })
                    // }
                }

                // move forward band out of the way of the incoming backward band
                forwardFirstBand && leadTailblockBand.after(forwardFirstBand)
                // insert new band in forward list
                leadTailblockBand.append(backwardFirstBand) // replace with new band
                // record moved band in forward list
                forwardBandList.unshift(backwardFirstBand) // add moved band
                // move next band into moved band's place
                backwardNextBand && leadHeadblockBand.append(backwardNextBand) 

                const bandContainerCount = backwardFirstBand.childElementCount
                cradleActual.forwardBands++
                cradleActual.forwardCells += bandContainerCount
                cradleActual.backwardBands--
                cradleActual.backwardCells -= bandContainerCount

                // move axis backward
                if (orientationRef.current == 'vertical') {

                    const 
                        currentPx = axisPositionRef.current.y,
                        movedHeight = backwardFirstBand.offsetHeight

                    setAxisPosition(0,currentPx - movedHeight, 'backward shift')

                } else { // horizontal

                    const 
                        currentPx = axisPositionRef.current.x,
                        movedWidth = backwardFirstBand.offsetWidth

                    setAxisPosition(currentPx - movedWidth, 0)

                }

            }

            // 2026-05-21: disabled ragged-start for leading tail band — direct cause of intermittent
            // blank cell at column 1. When a partial head band (e.g. items 0-1 in a 3-col grid) shifted
            // to tail while async forward-cell fill was still in-flight, this code set gridColumn on the
            // 2 cells, pushing them to cols 2-3 and leaving col 1 blank. The blank persisted because
            // no subsequent code cleared it. Fix: left-align partial bands throughout (items start at col 1).
            // const leadingTailBand = forwardBandList[0]
            // if (leadingTailBand) {
            //     const count = leadingTailBand.childElementCount
            //     const n = cradleActual.cellsPerBand
            //     if (count > 0 && count < n) {
            //         const prop = orientationRef.current === 'horizontal' ? 'gridRow' : 'gridColumn'
            //         Array.from(leadingTailBand.children).forEach((child, i) => {
            //             (child as HTMLElement).style[prop] = String(n - count + i + 1)
            //         })
            //     }
            // }

        }

        trimCradle()

        updateCurrentAxisReferenceID()

    }

    return evaluateIntersections

}

export default useIntersections