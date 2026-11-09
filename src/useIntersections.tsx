// useIntersections.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React, { useCallback, useEffect, useRef } from 'react'

import { reportError, errorMessage } from './utilities'

// A trackpad fling keeps sending wheel events for seconds after the fingers lift. A hold at an end of
// the data that is released inside that stream lets the rest of it push the list out again, and the
// list is put back a second and a third time, so that hold also waits for the wheel to go quiet
const END_OF_DATA_QUIET_WINDOW = 300

// The end state at the tail (below) rests the viewport's forward edge this far past the content's bottom in variable
// layout, so that the rows' own settling there (a late image, a reflow) is absorbed in the room rather than moving the
// list; uniform layout, whose rows do not settle, has none. A constant of the mechanism, not a setting
const TAIL_SLACK = 40

const useIntersections = ({

    scrollerName,

    // constants
    standardMomentumFadeRef,
    shortMomentumFadeRef,
    AXIS_START_POSITION,

    DOMManipulationQueueRef,

    orientationRef,
    layoutRef,

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
    lastScrollEventTimeRef,
    immediateStopScrollingRef,
    restoreScrollingTimeoutIDRef,

    // methods
    callbacksRef,
    setAxisPosition,
    assertIntersectionsDisconnect,
    requestIntersectionsConnect,
    fillCradle,
    updateCurrentAxisReferenceID,
    trimCradle,
    isFetchOpenAt,
    markQuiet,
    isQuietAt,
    clearQuietAt,
    onRunEndedRef,

}) => {

    const DOMManipulationQueue = DOMManipulationQueueRef.current

    // a hold begins on the observation of a crossing that a scroll caused. Scrolling mode ends at the browser's
    // scrollend, which an instant scroll (a wheel notch, a key) sends about a millisecond after it settles, before
    // that observation arrives, so the mode alone would say the scroll was over. Input this recent is still
    // arriving, and more may follow it within the fade, which is what the mode said while the fade timer was its
    // only end
    const isScrollInputRecent = () =>
        immediateIsScrollingRef.current || ((performance.now() - lastScrollEventTimeRef.current) < standardMomentumFadeRef.current)

    const holdRef = useRef({viewport:null, onWheel:null, endOfData:null, mark:null, lastWheelTime:0, count:0})

    // -------------------------[ shift measurement ]-------------------------

    // Both counts are read as the shift runs, from the bands and the viewport as they stand then: a task
    // queued ahead of the shift may have moved bands, and the viewport may have gone on scrolling, since the
    // trigger crossing was observed. A count taken at the crossing and carried into the task ran against bands
    // that had since moved. Each returns 0 when the trigger is no longer where the crossing put it.

    // The backward trigger sits at the top of the lead head band, so the gap is what the bands beyond that band
    // must cover: the lead band always moves, and each band after it moves until the band that would lead has
    // its top above the viewport
    const measureBackwardShiftCount = (trigger) => {

        const headBandList = headBandListRef.current

        if (!headBandList.length || !trigger || !viewportRef.current) return 0

        const
            vertical = orientationRef.current == 'vertical',
            rect = trigger.getBoundingClientRect(),
            viewportBounds = viewportRef.current.getBoundingClientRect(),
            axisGap = vertical
                ? rect.bottom - viewportBounds.top
                : rect.right - viewportBounds.left

        if (axisGap < 0) return 0 // the trigger is before the viewport again

        let bandIndex = headBandList.length - 1
        let bandSpan = 0
        while (bandIndex > 0) {
            bandSpan += vertical ? headBandList[bandIndex - 1].offsetHeight : headBandList[bandIndex - 1].offsetWidth
            if (bandSpan >= axisGap) break
            bandIndex--
        }

        return headBandList.length - bandIndex

    }

    // shiftAxis('forward') takes bands off the front of the tail list, so the span is measured from the front
    const measureForwardShiftCount = (trigger) => {

        const tailBandList = tailBandListRef.current

        if (!tailBandList.length || !trigger || !viewportRef.current) return 0

        const
            vertical = orientationRef.current == 'vertical',
            rect = trigger.getBoundingClientRect(),
            viewportBounds = viewportRef.current.getBoundingClientRect(),
            axisGap = vertical
                ? viewportBounds.top - rect.bottom
                : viewportBounds.left - rect.right

        if (axisGap <= 0) return 0 // the trigger is no longer before the viewport

        const size = band => vertical ? band.offsetHeight : band.offsetWidth

        let bandIndex = 0
        let bandSpan = size(tailBandList[bandIndex])
        let nextSize = 0
        while ((bandSpan + nextSize) < axisGap) {
            bandSpan += nextSize
            bandIndex++
            if (bandIndex >= tailBandList.length) break
            nextSize = size(tailBandList[bandIndex])
        }

        return Math.min(tailBandList.length, bandIndex + 1)

    }

    // -------------------------[ intersection observations controller ]-------------------------

    const evaluate = useCallback( async (source) => {

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

        // A viewport past every edge of a cradle that is short of its potential at that end has run past the end
        // of the data, not lost the cradle: the host was asked for more there and had none. That is the overflow
        // of that block, below, which asks once more and then holds the end. A full cradle the scroll has outrun is
        // brought to the viewport: every band goes to the side the scroll came from, the axis is set under the
        // viewport's own position, and the fill stands the rows ahead on the other side. The viewport is never
        // moved and never held for it: a scroll write against a fling puts the rows the user flung past back under
        // them and ends their momentum, and in Chrome the fling's remaining wheels are then applied to the
        // position written, which lands the viewport where it started
        const outrunEnd = allAreBefore ? 'tail' : allAreAfter ? 'head' : null

        // a cradle short at that end with a fetch open there is waiting on the host, not at the end of the data:
        // the scroll outran it again while the last fill was open, and the task queues behind that fill
        // Past the tail's known end there is no cradle to bring: the content ends where it ends, and the end state brings
        // the viewport back to its mark (bringBackToTailEndMark). The re-ask's open fetch is the state's own, not a bet
        // that rows are coming, so the end stands through it
        if (outrunEnd && (outrunEnd == 'head' || !tailEndStands()) && (!isCradleShortAt(outrunEnd) || isFetchOpenAt(outrunEnd))) {

            assertIntersectionsDisconnect()

            const bringCradleToViewport = async () => {

                assertIntersectionsDisconnect()

                try {

                    const
                        viewport = viewportRef.current,
                        vertical = orientationRef.current == 'vertical',
                        viewportRect = viewport.getBoundingClientRect(),
                        headRect = headblockRef.current.getBoundingClientRect(),
                        tailRect = tailblockRef.current.getBoundingClientRect(),
                        // measured again as the task runs: a fill queued ahead of it may have stood rows under
                        // the viewport, and a cradle the viewport is back inside is left to the observers
                        stillOutrun = outrunEnd == 'tail'
                            ? (vertical ? tailRect.bottom <= viewportRect.top : tailRect.right <= viewportRect.left)
                            : (vertical ? headRect.top >= viewportRect.bottom : headRect.left >= viewportRect.right)

                    if (!stillOutrun) return

                    if (outrunEnd == 'tail') {

                        shiftAxis('forward', tailBandListRef.current.length)
                        if (vertical) setAxisPosition(0, viewport.scrollTop + 1, 'outrun')
                        else setAxisPosition(viewport.scrollLeft + 1, 0, 'outrun')

                    } else {

                        shiftAxis('backward', headBandListRef.current.length)
                        if (vertical) setAxisPosition(0, viewport.scrollTop + viewport.clientHeight - 1, 'outrun')
                        else setAxisPosition(viewport.scrollLeft + viewport.clientWidth - 1, 0, 'outrun')

                    }

                    await fillCradle()

                } finally {

                    requestIntersectionsConnect()

                }

            }

            await DOMManipulationQueue.enqueue(bringCradleToViewport)

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

            // no hold is taken here: the end of the data is found by the host's answer, and the answer's handler
            // (onRunEndedRef) takes the end hold with the viewport at that end
            if (isScrollInputRecent()) clearQuietAt('head')

            const executeHeadOverflow = async () => {
    
                assertIntersectionsDisconnect()

                try {

                    adjustForHeadOverflow()

                    await fillCradle()

                } finally {

                    requestIntersectionsConnect()

                }
            }

            await DOMManipulationQueue.enqueue(executeHeadOverflow)

            return

        }

        // --- tail overflow

        // inside the end state, and through its re-ask, the trigger is not consulted: the list is stabilized at the
        // axis, and the tail is asked again by a gesture past the mark (onTailEndScroll), not by the crossing. The
        // re-ask goes to adjustForTailOverflow itself (reaskTail)
        if (( tailblockOverflowTrigger.rs3position != 'after' ) && headBandListRef.current.length && !tailEndStands()) {

            // console.log('TAIL OVERFLOW')

            assertIntersectionsDisconnect()

            const forwardTrigger = leadTailblockBandForwardTrigger?.target

            const executeTailOverflow = async () => {

                assertIntersectionsDisconnect()

                try {

                    const settled = await adjustForTailOverflow()

                    // this branch precedes the shift branch and returns, so while the tail's fetch stayed open a shift
                    // the scroll owed was deferred past the answer, and landed under whatever input followed it
                    if (!settled) {

                        const count = measureForwardShiftCount(forwardTrigger)

                        if (count) shiftAxis('forward', count)

                    }

                } finally {

                    requestIntersectionsConnect()

                }

            }

            await DOMManipulationQueue.enqueue(executeTailOverflow)

            return

        }

        // shift axis backward

        // 'after' is the trigger past the viewport's end with the viewport inside the head block: a crossing that
        // ran while the observers were disconnected (a resize debounce, a queued task) reconnects in that state,
        // with no trigger 'in', and the forward side already fires on its own past state ('before')
        if ( leadHeadblockBandBackwardTrigger.rs3position == 'in' || leadHeadblockBandBackwardTrigger.rs3position == 'after' ) {

            assertIntersectionsDisconnect()

            const trigger = leadHeadblockBandBackwardTrigger.target

            const executeShiftBackward = async () => {

                assertIntersectionsDisconnect()

                try {

                    const count = measureBackwardShiftCount(trigger)

                    // with no head band left, shiftAxis('backward', 0) sets the axis just above the viewport for
                    // the backward fetch, as it always has; a count of 0 with head bands means the trigger is no
                    // longer past the edge, and nothing moves
                    if (count || !headBandListRef.current.length) shiftAxis('backward',count) // axis backward, bands forward

                    await fillCradle()

                } finally {

                    requestIntersectionsConnect()

                }

            } 

            await DOMManipulationQueue.enqueue(executeShiftBackward)

            return
        }

        // --- shift axis forward

        // inside the end state nothing is coming forward, so the cradle does not follow the viewport there: a band
        // shifted through the axis would be withdrawn from the head when it is the re-ask's placeholder, and the head
        // is anchored at the axis, so the rows would drop by its height. The backward shift stays live
        if ( leadTailblockBandForwardTrigger.rs3position == 'before' && !tailEndStands() ) {

            if (!tailBandListRef.current.length) return

            assertIntersectionsDisconnect()

            const trigger = leadTailblockBandForwardTrigger.target

            const executeShiftForward = async () => {

                assertIntersectionsDisconnect()

                try {

                    const count = measureForwardShiftCount(trigger)

                    if (count) shiftAxis('forward', count) // axis forward, bands backward

                    await fillCradle()

                } finally {

                    requestIntersectionsConnect()

                }

            }

            await DOMManipulationQueue.enqueue(executeShiftForward)

            return

        }

    },[])

    // The callers do not wait for an evaluation, so a failure inside one is reported, and the observers
    // are reconnected, here.
    const evaluateIntersections = useCallback((source) => {

        return evaluate(source).catch((error) => {

            if (!viewportRef.current) return

            reportError(callbacksRef, 'evaluateIntersections', errorMessage(error), [source])

            requestIntersectionsConnect()

        })

    },[])

    // -------------------------[ scrolling hold ]-------------------------

    // The viewport is pinned where it is and cannot be scrolled until the hold is released.
    // overflow:hidden is what stops the browser's own momentum. A browser scrolls on its
    // compositor first, so a list held by scrollTo alone is painted displaced, then put back,
    // on every momentum event (Safari shakes and can lose its place).
    // A hold is released STANDARD_SCROLL_MOMENTUM_FADE after it began. One at the head of the data
    // (endOfData 'head') is also kept until the wheel has been quiet for END_OF_DATA_QUIET_WINDOW, and
    // is released at once by a wheel away from that end. One at the tail (endOfData 'tail') is the entry
    // of the end state (below): the fade alone releases it, and no wheel is cancelled, since the state
    // keeps the list at the end from then on; a wheel away from the end releases it as at the head.
    // An end of the data is only what the host last answered. The wait for quiet ends when the host's
    // fetchCradleCells has reset the cradle or brought cells to the held end, or a push that never pauses
    // would stay held in front of cells it could scroll into.
    // A hold begun by position recovery is never one at an end of the data, whatever follows it: the
    // cradle has just been put back, and a release before the fixed time lets the scroll outrun it again
    // inside the recovery's own guard, which strands the list out of view.
    // A held viewport cannot take the wheel, and a browser may then hand it to a scrollable ancestor
    // in spite of overscroll-behavior, so the wheel along the list's axis is cancelled where it can be
    // (not at the tail: its hold is the fade long, and the state takes the gesture).
    // A cancelled wheel scrolls nothing, so the wheel being cancelled is what holds the list, and
    // overflow is restored. A wheel gesture that meets an overflow:hidden list can belong to the
    // ancestor from then on (Safari): the scroll back out of an end, or what is left of a fling when
    // a hold lets go, would then move what is behind the list. A wheel that cannot be cancelled hides
    // the list again
    const holdScrolling = (endOfData = null) => {

        const
            hold = holdRef.current,
            viewport = viewportRef.current

        viewport.style.overflow = 'hidden'
        immediateStopScrollingRef.current = true
        hold.endOfData = null
        hold.mark = null
        endOfData && markEndOfData(endOfData)
        hold.count++

        if (!hold.viewport) { // the wheel is listened to for the life of a hold only

            hold.viewport = viewport
            hold.onWheel = onHoldWheel
            hold.lastWheelTime = 0
            viewport.addEventListener('wheel', onHoldWheel, {passive:false})

        }

        clearTimeout(restoreScrollingTimeoutIDRef.current)
        restoreScrollingTimeoutIDRef.current = setTimeout(releaseHoldWhenQuiet,standardMomentumFadeRef.current)

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

        if (hold.endOfData != 'tail' && event.cancelable && (Math.abs(delta) >= Math.abs(crossDelta))) {

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

        if (hold.endOfData == 'head' && viewportRef.current && (quietTime < END_OF_DATA_QUIET_WINDOW) && isEndAsMarked()) {

            restoreScrollingTimeoutIDRef.current =
                setTimeout(releaseHoldWhenQuiet,END_OF_DATA_QUIET_WINDOW - quietTime)
            return

        }

        releaseHold()

    }

    // the end of the data is the one memory the fill keeps (useCells markQuiet / isQuietAt): the hold names the end it
    // is held at, marks the end there, and keeps the mark it was taken on
    const markEndOfData = (end) => {

        const hold = holdRef.current

        hold.endOfData = end
        hold.mark = markQuiet((end == 'tail')?'forward':'backward', 'end')

    }

    // a reset starts a new cradle, cells that arrive at the held end change which cell it ends on, and a structural call
    // changes the data: each drops the mark. The answer that follows marks the end again, on the rows that arrived or
    // the new cradle, and the hold is not held on it: a push that was held while rows were fetched to its end goes on
    // to them. The empty answer the hold waited on marks the end as the hold has it, and keeps it
    const isEndAsMarked = () => isQuietAt((holdRef.current.endOfData == 'tail')?'forward':'backward', holdRef.current.mark)

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
        hold.mark = null

    }

    // a hold live at the unmount keeps its wheel listener on the element it was added to, and the timer that would
    // release it is cleared by the scroller's cleanup, so the release is made here
    useEffect(() => () => {
        releaseHold()
        clearTimeout(tailEndRef.current.gestureTimeoutID)
    }, [])

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

    // -------------------------[ the end state at the tail ]-------------------------

    // Once the host has answered empty at the tail (the fill's one end memory: markQuiet / isQuietAt in useCells) and
    // the viewport has reached the content's bottom, the list is stabilized at the axis: the tail overflow trigger is
    // not consulted, and the scroller moves the viewport only to bring a gesture past the mark back. Two marks meet
    // here. The quiet mark is the end memory, the host's answer. The position mark (markFromAxis) is where the
    // viewport's forward edge rests, kept from the axis: a shift, a reset and a relayout all move the axis with the
    // content, so the mark stays where the content is through them. Being inside the state is the two together: the
    // position mark exists only while the end memory stands, so a trim of the last row, a structural call, a reset, a
    // new cradle or rows at the end leave the state with the memory, with no flag of its own to keep in step
    const tailEndRef = useRef({markFromAxis:null, reaskOpen:false, bringingBack:false, gestureTimeoutID:null})

    const tailSlack = () => (layoutRef.current == 'variable') ? TAIL_SLACK : 0

    // the position mark is dropped when the end memory is found gone, unless a re-ask is out: the re-ask cleared the
    // memory itself (reaskOpen while the adjustment has the ask, the open fetch after), and an empty answer stands the
    // state up again on the same mark, so the room it showed stays
    const insideTailEndState = () => {

        const state = tailEndRef.current

        if (isQuietAt('forward')) return state.markFromAxis !== null

        if (!state.reaskOpen && !isFetchOpenAt('tail')) state.markFromAxis = null

        return false

    }

    // the end stands inside the state and through its re-ask: insideTailEndState drops the mark when the memory is gone
    // for any other reason, so a mark still held after it is read is the state's or its re-ask's
    const tailEndStands = () => insideTailEndState() || (tailEndRef.current.markFromAxis !== null)

    // an empty headblock still measures a pixel: with no head row the head's dimension is nothing
    const headRowsDimension = () => {

        if (!cradleActualRef.current.backwardCells) return 0

        return (orientationRef.current == 'horizontal') ? headblockRef.current.offsetWidth : headblockRef.current.offsetHeight

    }

    const tailGeometry = () => {

        const
            isH = orientationRef.current == 'horizontal',
            viewport = viewportRef.current

        return {
            isH,
            axis: isH ? axisPositionRef.current.x : axisPositionRef.current.y,
            headDim: headRowsDimension(),
            tailDim: isH ? tailblockRef.current.offsetWidth : tailblockRef.current.offsetHeight,
            viewportDim: isH ? viewport.clientWidth : viewport.clientHeight,
            scrollPos: isH ? viewport.scrollLeft : viewport.scrollTop,
        }

    }

    // the mark is the content's bottom plus the slack, or the previous mark where that is further: growth moves it on,
    // and a shrink leaves the room the viewport had shown. A viewport whose forward edge is above the content's bottom
    // has scrolled up to see the content's end, and the mark is reset to it. Read only inside the state, or on entry.
    // Where the head stands, the mark is never short of the viewport's own forward edge with its leading edge at the
    // head's rest (a pixel past the first row's edge, as isViewportAtEnd reads it): a content shorter than the
    // viewport is at its head and its tail at once, and a mark the viewport could reach only by crossing the head
    // would have the head re-seat the viewport and the tail bring it back, in turns, for as long as the list stood.
    // The head stands with no backward cell (the head overflow re-seats the viewport there) or on the host's empty
    // answer; a cradle with rows above still to come is crossed, which is how the head is asked for them
    const tailEndMark = () => {

        const
            state = tailEndRef.current,
            { axis, headDim, tailDim, viewportDim, scrollPos } = tailGeometry(),
            headStands = !cradleActualRef.current.backwardCells || isQuietAt('backward'),
            floor = Math.max(tailDim + tailSlack(), headStands ? (1 - headDim + viewportDim) : 0),
            viewportEndFromAxis = scrollPos + viewportDim - axis

        state.markFromAxis = (viewportEndFromAxis < tailDim) ? floor : Math.max(state.markFromAxis ?? floor, floor)

        return axis + state.markFromAxis

    }

    // a shift moves the axis under the content by the moved band's dimension, and the mark stays with the content
    const keepTailEndMarkUnderShift = (delta) => {

        const state = tailEndRef.current

        if (state.markFromAxis !== null) state.markFromAxis -= delta

    }

    // the entry's snap: the viewport's forward edge is put at the mark, instantly
    const snapToTailEndMark = (mark, onlyIfPast) => {

        const
            { isH, viewportDim, scrollPos } = tailGeometry(),
            position = mark - viewportDim

        if (onlyIfPast && (scrollPos <= position)) return

        if (isH) {
            scrollLeftRef.current = position
            viewportRef.current.scrollTo(position, viewportRef.current.scrollTop)
        } else {
            scrollTopRef.current = position
            viewportRef.current.scrollTo(viewportRef.current.scrollLeft, position)
        }

    }

    // Entry, once. The end is marked where the answer did not mark it (the inline fill's empty answer at cap 0 marks
    // nothing, and the trigger's inference from a cradle still short after the fill is the end). The viewport is
    // snapped to the mark and, under input, held to stop its momentum: the plain hold, with no quiet window and no
    // wheel cancelling, since the state does from here what the hold's extensions did. A re-entry during a bring-back
    // neither snaps nor holds: the smooth scroll is already taking the viewport to the mark. An answer that stands
    // the state up again on a kept mark reads the viewport against it: nothing read it while the re-ask was out, and
    // a gesture in that time may have left it past the mark
    const enterTailEndState = (onlyIfPast) => {

        const state = tailEndRef.current

        if (!isQuietAt('forward')) markQuiet('forward', 'end')

        if (insideTailEndState()) {

            onTailEndScroll(false)
            return

        }

        const mark = tailEndMark()

        if (state.bringingBack) return

        snapToTailEndMark(mark, onlyIfPast)

        if (holdRef.current.viewport || isScrollInputRecent()) holdScrolling('tail')

    }

    // Every unpinned scroll event inside the state reads the viewport against the mark. A gesture past the mark is
    // brought back once the input has faded (SHORT_MOMENTUM_FADE from the last scroll event), not fought while it
    // runs; a gesture that comes back above the mark by itself owes nothing. The bring-back's own scroll events, and
    // a held viewport's, are not gestures and are not read here: the mode's end re-reads the viewport for them
    // (onTailEndScrollingModeEnd), so no reading is dropped. The same reading is taken when an answer stands the
    // state up again (enterTailEndState), without the ask: the answer that has just arrived is that gesture's, and
    // a bring-back a gesture has already scheduled stands, with its ask
    const onTailEndScroll = (ask = true) => {

        const state = tailEndRef.current

        if (!insideTailEndState() || state.bringingBack || holdRef.current.viewport) return

        if (!ask && (state.gestureTimeoutID !== null)) return

        const
            mark = tailEndMark(),
            { viewportDim, scrollPos } = tailGeometry()

        clearTimeout(state.gestureTimeoutID)
        state.gestureTimeoutID = null

        if ((scrollPos + viewportDim) <= mark) return

        state.gestureTimeoutID = setTimeout(() => bringBackToTailEndMark(ask), shortMomentumFadeRef.current)

    }

    const onTailEndScrollingModeEnd = () => {

        tailEndRef.current.bringingBack = false

        onTailEndScroll()

    }

    // The viewport past the mark is brought back to it with a smooth scroll, and a gesture's bring-back asks the tail
    // once more: the gesture into the end is the user asking for more, and the placeholders that stand for the ask
    // are the feedback. Rows answered extend the content and leave the state (the end memory goes with the end cell);
    // an empty answer stands the state up again on the same mark and reads the viewport against it, since a gesture
    // made while the ask was out was read by nothing: that bring-back does not ask again
    const bringBackToTailEndMark = (ask) => {

        const state = tailEndRef.current

        state.gestureTimeoutID = null

        if (!viewportRef.current || !insideTailEndState()) return

        const
            mark = tailEndMark(),
            { isH, viewportDim, scrollPos } = tailGeometry()

        if ((scrollPos + viewportDim) > mark) {

            state.bringingBack = true
            viewportRef.current.scrollTo(isH ? {left:mark - viewportDim, behavior:'smooth'} : {top:mark - viewportDim, behavior:'smooth'})

        }

        if (ask) reaskTail()

    }

    // the re-ask goes through the overflow adjustment, whose answer is the entry's (an inline empty answer at cap 0
    // enters by its inference, as at the trigger). The end memory is cleared inside the task, so that nothing reads
    // the state between the clearing and the ask; the adjustment closes reaskOpen with its answer
    const reaskTail = () => {

        tailEndRef.current.reaskOpen = true

        const task = async () => {

            assertIntersectionsDisconnect()

            try {

                clearQuietAt('tail')

                await adjustForTailOverflow()

            } finally {

                requestIntersectionsConnect()

            }

        }

        DOMManipulationQueue.enqueue(task).catch((error) => {

            if (!viewportRef.current) return

            reportError(callbacksRef, 'reaskTail', errorMessage(error), [])

        })

    }

    // The tail overflow, and the re-ask: true when the end of the data is there and the state was entered. With the
    // end known (the quiet mark standing: an answer that came while the viewport was still short of the end) nothing
    // is asked. Otherwise the fill asks, and rows that arrive, or a fetch left open (the placeholders standing there
    // size the tailblock, and the answer fills in place), settle nothing here. A cradle at its potential with nothing
    // to ask for was outrun, not ended: the rows ahead answer that, by the shift the caller measures and the outrun
    // branch on the next observation. A cradle still short after the fill with no fetch open was answered inline
    // with nothing (cap 0 marks nothing itself), which is the end
    const adjustForTailOverflow = async () => {

        try {

            if (!isQuietAt('forward')) {

                const forwardCellsBefore = cradleActualRef.current.forwardCells

                await fillCradle()

                if (cradleActualRef.current.forwardCells > forwardCellsBefore || isFetchOpenAt('tail')) return false

                if (!isQuietAt('forward') && !isCradleShortAt('tail')) return false

            }

            enterTailEndState(false)

            return true

        } finally {

            tailEndRef.current.reaskOpen = false

        }

    }

    // for getCradleSpecs: whether the list is in the end state, and the mark it rests at
    const tailEndStateReport = () => {

        const
            inside = insideTailEndState(),
            slack = tailSlack()

        if (!inside || !viewportRef.current) return {inside, mark:null, slack, contentBottom:null}

        const { axis, tailDim } = tailGeometry()

        return {inside, mark:tailEndMark(), slack, contentBottom:axis + tailDim}

    }

    // The host answered an ask at an end with nothing, or failed to answer it. Two callers: a placeholder run's
    // answer, which arrives after the fill that asked had returned and takes that end's placeholders with it, and,
    // with placeholders off, the inline fill's empty answer to 'before'. A viewport still bands away from that end has
    // rows to scroll into, and the overflow there marks the end when it arrives: nothing is held short of them. At
    // the tail the answer enters the end state (the entry snaps and holds); the end memory keeps a failure as it
    // keeps an empty answer, and the state's re-ask is how the host is asked again. At the head a hold already
    // standing, or one a scroll still in progress earns, is told it is at the end of the data when the answer was
    // empty; a failed answer holds without marking the end, and the host may answer next time
    onRunEndedRef.current = (direction, reason) => {

        if (!viewportRef.current) return

        const
            end = (direction == 'forward')?'tail':'head',
            hold = holdRef.current

        if (hold.viewport && hold.endOfData && (hold.endOfData != end)) return // held at the other end

        if (!isViewportAtEnd(end)) return

        if (end == 'tail') {

            enterTailEndState(true)
            return

        }

        if (hold.viewport || isScrollInputRecent()) holdScrolling((reason == 'end')?end:null)

    }

    // the viewport's leading edge at or past the first head row, or its trailing edge at or past the last tail row
    const isViewportAtEnd = (end) => {

        const
            isH = orientationRef.current === 'horizontal',
            viewport = viewportRef.current,
            axis = isH ? axisPositionRef.current.x : axisPositionRef.current.y,
            scrollPos = isH ? viewport.scrollLeft : viewport.scrollTop

        if (end == 'head') {

            // the head repositioning rests the viewport a pixel past the axis: with no head row the boundary is the
            // axis itself
            return scrollPos <= (axis - headRowsDimension() + 1)

        }

        const
            tailDim = isH ? tailblockRef.current.offsetWidth : tailblockRef.current.offsetHeight,
            vpDim = isH ? viewport.clientWidth : viewport.clientHeight

        return scrollPos >= (axis + tailDim - vpDim - 1)

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
                    keepTailEndMarkUnderShift(movedHeight)

                } else { // horizontal}

                    const 
                        currentPx = axisPositionRef.current.x,
                        movedWidth = forwardFirstBand.offsetWidth

                    setAxisPosition(currentPx + movedWidth,0)
                    keepTailEndMarkUnderShift(movedWidth)

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
                    keepTailEndMarkUnderShift(-movedHeight)

                } else { // horizontal

                    const 
                        currentPx = axisPositionRef.current.x,
                        movedWidth = backwardFirstBand.offsetWidth

                    setAxisPosition(currentPx - movedWidth, 0)
                    keepTailEndMarkUnderShift(-movedWidth)

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

    return { evaluateIntersections, onTailEndScroll, onTailEndScrollingModeEnd, tailEndStateReport }

}

export default useIntersections