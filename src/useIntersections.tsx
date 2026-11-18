// useIntersections.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React, { useCallback, useEffect, useRef } from 'react'

import { reportError, errorMessage } from './utilities'
import { isPlaceholderID } from './placeholders'

// The end state (below) rests the viewport's edge this far past the content's edge at the tail in variable layout, so
// that the rows' own settling there (a late image, a reflow) is absorbed in the room rather than moving the list;
// uniform layout, whose rows do not settle, has none. The head has none in either layout: its mark is the content's
// top, so the first row rests at the viewport's start. A constant of the mechanism, not a setting
const END_SLACK = 40

// The pull past an end the host has fixed is drawn no farther past its mark than this, or a tenth of the viewport
// where that is less (endElasticCap). A constant of the mechanism, not a setting
const END_ELASTIC_CAP = 60

// The return of a fixed end's stretch is one slide of the transform (slideToEndMark), and this is its timing: how the
// return feels. Nothing is sequenced on it: what follows the slide waits on the slide's own end
const END_RETURN = {duration:180, easing:'ease-out'}

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
    holdCrossOpenRef,
    restoreScrollingTimeoutIDRef,

    // methods
    callbacksRef,
    setAxisPosition,
    slideAxis,
    readAxisSlide,
    assertIntersectionsDisconnect,
    requestIntersectionsConnect,
    fillCradle,
    updateCurrentAxisReferenceID,
    trimCradle,
    isFetchOpenAt,
    isEndFixed,
    markQuiet,
    isQuietAt,
    quietReasonAt,
    clearQuietAt,
    isEndAskAt,
    onRunEndedRef,
    bringOutrunCradleRef,
    setEndIndicators,

}) => {

    const DOMManipulationQueue = DOMManipulationQueueRef.current

    // a hold begins on the observation of a crossing that a scroll caused. Scrolling mode ends at the browser's
    // scrollend, which an instant scroll (a wheel notch, a key) sends about a millisecond after it settles, before
    // that observation arrives, so the mode alone would say the scroll was over. Input this recent is still
    // arriving, and more may follow it within the fade, which is what the mode said while the fade timer was its
    // only end
    const isScrollInputRecent = () =>
        immediateIsScrollingRef.current || ((performance.now() - lastScrollEventTimeRef.current) < standardMomentumFadeRef.current)

    const holdRef = useRef({viewport:null, onWheel:null, endOfData:null, count:0, keeper:null})

    // -------------------------[ shift measurement ]-------------------------

    // An element's span on the scroll axis from the viewport's start, read from layout as a queued task runs. The
    // observation that queued the task was taken earlier: a task ahead of it, or an answer applied since, may have
    // stood or moved bands, so a task acts on the cradle as it stands then, not as the observation saw it
    const spanFromViewportStart = (element) => {

        const
            rect = element.getBoundingClientRect(),
            viewportBounds = viewportRef.current.getBoundingClientRect()

        return (orientationRef.current == 'vertical')
            ? {start: rect.top - viewportBounds.top, end: rect.bottom - viewportBounds.top, viewportSpan: viewportBounds.height}
            : {start: rect.left - viewportBounds.left, end: rect.right - viewportBounds.left, viewportSpan: viewportBounds.width}

    }

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

    // At every task boundary the cradle agrees with the viewport: no run stands wholly behind it, and the room
    // ahead is stood. A queued task that moves the cradle ends in followViewport, inside its own turn of the queue.
    // A second task would wait behind an answer already queued, and that answer filled its rows where the first
    // task had left the cradle, behind the viewport.
    // A task that only fills starts from the same measure. A scroll moves the viewport at once and the scroller's
    // response to it is a task queued later, so a fill that runs in between would stand its rows where the last
    // task left the cradle. The answer's task reaches the measure through bringOutrunCradleRef, and fills from it
    // before it applies the answer; the head overflow's entry takes it in place of its own adjustment; the host's
    // fill takes it before it clears the end memories, which the measure reads an end through.
    // The outrun is read from layout as the task runs, and before the task's own shift: that shift takes bands out
    // of the block the scroll is leaving, and a block it left short would read as an end the host had answered
    // empty at (evaluate's gate, below, which is this one). An outrun cradle is brought whole: every band goes to
    // the side the scroll came from, the axis is written under the viewport's own position, and the fill that
    // follows takes down what the scroll carried behind and stands the rows ahead. A fill alone stood them from
    // the old axis. The observers are off for the bring whoever makes it: a trigger the bring carries from one
    // side of the viewport to the other reports nothing, and its old position would be read as the cradle's.
    // True when the cradle was brought. A viewport with no box (a hidden scroller measures nothing) is at no
    // position, and is past nothing
    const bringOutrunCradle = () => {

        const
            viewport = viewportRef.current,
            vertical = orientationRef.current == 'vertical',
            tail = viewport && spanFromViewportStart(tailblockRef.current),
            outrunEnd = !tail?.viewportSpan ? null
                : (tail.end <= 0) ? 'tail'
                : (spanFromViewportStart(headblockRef.current).start >= tail.viewportSpan) ? 'head'
                : null

        if (outrunEnd && !endStands(outrunEnd) && (!isCradleShortAt(outrunEnd) || isFetchOpenAt(outrunEnd))) {

            assertIntersectionsDisconnect()

            if (outrunEnd == 'tail') {

                shiftAxis('forward', tailBandListRef.current.length)
                if (vertical) setAxisPosition(0, viewport.scrollTop + 1, 'outrun')
                else setAxisPosition(viewport.scrollLeft + 1, 0, 'outrun')

            } else {

                shiftAxis('backward', headBandListRef.current.length)
                if (vertical) setAxisPosition(0, viewport.scrollTop + viewport.clientHeight - 1, 'outrun')
                else setAxisPosition(viewport.scrollLeft + viewport.clientWidth - 1, 0, 'outrun')

            }

            return true

        }

        return false

    }

    bringOutrunCradleRef.current = bringOutrunCradle

    // the bring where the cradle is outrun, otherwise the caller's shift as it measures it; then the fill
    const followViewport = async (shift = null) => {

        if (!bringOutrunCradle() && shift) shift()

        await fillCradle()

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
        // Past an end the host has answered empty at there is no cradle to bring: the content ends where it ends, and
        // the end state brings the viewport back to its mark (bringBackToEndMark). The re-ask's open fetch is the
        // state's own, not a bet that rows are coming, so the end stands through it
        if (outrunEnd && !endStands(outrunEnd) && (!isCradleShortAt(outrunEnd) || isFetchOpenAt(outrunEnd))) {

            assertIntersectionsDisconnect()

            const bringCradleToViewport = async () => {

                assertIntersectionsDisconnect()

                try {

                    const
                        // measured again as the task runs: a fill queued ahead of it may have stood rows under
                        // the viewport, and a cradle the viewport is back inside is left to the observers
                        block = spanFromViewportStart(outrunEnd == 'tail' ? tailblockRef.current : headblockRef.current),
                        stillOutrun = outrunEnd == 'tail'
                            ? block.end <= 0
                            : block.start >= block.viewportSpan

                    if (!stillOutrun) return

                    await followViewport()

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

        // inside the end state at an end, and through its re-ask, that end's overflow trigger is not consulted: the
        // list is stabilized at the axis, and the end is asked again by a gesture past its mark (onEndScroll), not by
        // the crossing. The re-ask goes to adjustForEndOverflow itself (reaskEnd)
        if (( headblockOverflowTrigger.rs3position != 'before' ) && !endStands('head')) {

            // console.log('HEAD OVERFLOW')

            assertIntersectionsDisconnect()

            const backwardTrigger = leadHeadblockBandBackwardTrigger?.target

            const executeHeadOverflow = async () => {
    
                assertIntersectionsDisconnect()

                try {

                    // measured again as the task runs, as the outrun's cradle is: an answer applied after the crossing
                    // was observed may have stood rows in the head and put its edge back before the viewport. The
                    // overflow is then over, and the bands standing past the viewport's start are the backward
                    // shift's, counted as that shift counts them: none while its trigger is before the viewport too
                    if (spanFromViewportStart(headblockOverflowTriggerRef.current).end >= 0) {

                        // a cradle the scroll has carried the viewport wholly back past is brought to it instead: the
                        // adjustment would stand the head's room at the cradle's far edge, out of sight
                        if (!bringOutrunCradle()) adjustForHeadOverflow()

                        // a list arrived at on its first row is not moved: the entry snaps only a viewport that is
                        // past the mark
                        await adjustForEndOverflow('head', true)

                    } else {

                        await followViewport(() => {

                            const count = measureBackwardShiftCount(backwardTrigger)

                            if (count) shiftAxis('backward', count)

                        })

                    }

                } finally {

                    requestIntersectionsConnect()

                }
            }

            await DOMManipulationQueue.enqueue(executeHeadOverflow)

            return

        }

        // --- tail overflow

        if (( tailblockOverflowTrigger.rs3position != 'after' ) && headBandListRef.current.length && !endStands('tail')) {

            // console.log('TAIL OVERFLOW')

            assertIntersectionsDisconnect()

            const forwardTrigger = leadTailblockBandForwardTrigger?.target

            const executeTailOverflow = async () => {

                assertIntersectionsDisconnect()

                try {

                    // the crossing's entry puts the viewport's edge at the mark wherever it is
                    const settled = await adjustForEndOverflow('tail', false)

                    // this branch precedes the shift branch and returns, so while the tail's fetch stayed open a shift
                    // the scroll owed was deferred past the answer, and landed under whatever input followed it.
                    // The adjustment filled before that shift, at the axis as it stood: the room the shift opens,
                    // or the cradle the scroll has outrun by now, is the shared end's
                    if (!settled) await followViewport(() => {

                        const count = measureForwardShiftCount(forwardTrigger)

                        if (count) shiftAxis('forward', count)

                    })

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
        if (( leadHeadblockBandBackwardTrigger.rs3position == 'in' || leadHeadblockBandBackwardTrigger.rs3position == 'after' ) && !endStands('head')) {

            assertIntersectionsDisconnect()

            const trigger = leadHeadblockBandBackwardTrigger.target

            const executeShiftBackward = async () => {

                assertIntersectionsDisconnect()

                try {

                    await followViewport(() => {

                        const count = measureBackwardShiftCount(trigger)

                        // with no head band left, shiftAxis('backward', 0) sets the axis just above the viewport for
                        // the backward fetch, as it always has; a count of 0 with head bands means the trigger is no
                        // longer past the edge, and nothing moves
                        if (count || !headBandListRef.current.length) shiftAxis('backward',count) // axis backward, bands forward

                    })

                } finally {

                    requestIntersectionsConnect()

                }

            } 

            await DOMManipulationQueue.enqueue(executeShiftBackward)

            return
        }

        // --- shift axis forward

        // where the end state stands at an end nothing is coming from it, so the cradle does not follow the viewport
        // there. The shift toward the other end stays live
        if ( leadTailblockBandForwardTrigger.rs3position == 'before' && !endStands('tail') ) {

            if (!tailBandListRef.current.length) return

            assertIntersectionsDisconnect()

            const trigger = leadTailblockBandForwardTrigger.target

            const executeShiftForward = async () => {

                assertIntersectionsDisconnect()

                try {

                    await followViewport(() => {

                        const count = measureForwardShiftCount(trigger)

                        if (count) shiftAxis('forward', count) // axis forward, bands backward

                    })

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
    // overflow hidden along the list's axis is what stops the browser's own momentum. A browser
    // scrolls on its compositor first, so a list held by scrollTo alone is painted displaced, then
    // put back, on every momentum event (Safari shakes and can lose its place).
    // The hold closes the list's axis only, and the viewport stays the scroll container the gesture
    // began in: the cross axis is left open over the keeper, an inert element that gives it 1px of
    // range. With both axes hidden nothing is left for the viewport to scroll; Safari then drops the
    // gesture's hold on it and gives the rest of a fling's momentum to the nearest scrollable box
    // around the list. The range is what keeps it: an open cross axis with nothing to scroll is
    // dropped the same way. The pin (onViewportScroll) keeps the cross axis where it was, so the
    // keeper's pixel is never shown. A list with room across of its own (bands wider than the
    // viewport) is not kept there: its cross axis has a range without the keeper, and stays the
    // gesture's while the hold stands. The pin then puts back the list's axis alone.
    // A hold is the entry of the end state (below) at an end of the data, the same at the head and
    // the tail: it is released STANDARD_SCROLL_MOMENTUM_FADE after it began, or at once by a wheel
    // away from that end. No wheel is cancelled and no quiet is waited for, since the state keeps
    // the list at the end from then on
    const holdScrolling = (endOfData = null) => {

        const
            hold = holdRef.current,
            viewport = viewportRef.current,
            vertical = (orientationRef.current == 'vertical'),
            keeper = hold.keeper ?? document.createElement('div')

        // 1px past the viewport on each side across the axis, so the range is there in a right-to-left box too
        keeper.dataset.type = 'hold-keeper'
        keeper.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;' + (vertical
            ?'top:0;left:-1px;width:calc(100% + 2px);height:1px'
            :'left:0;top:-1px;height:calc(100% + 2px);width:1px')
        if (keeper.parentNode !== viewport) {

            // read as the hold opens, before the keeper is in: with it every viewport has a range across
            holdCrossOpenRef.current = vertical
                ?(viewport.scrollWidth > viewport.clientWidth)
                :(viewport.scrollHeight > viewport.clientHeight)
            viewport.append(keeper)

        }
        hold.keeper = keeper
        viewport.style.overflowX = vertical?'auto':'hidden'
        viewport.style.overflowY = vertical?'hidden':'auto'
        immediateStopScrollingRef.current = true
        hold.endOfData = endOfData
        hold.count++

        if (!hold.viewport) { // the wheel is listened to for the life of a hold only

            hold.viewport = viewport
            hold.onWheel = onHoldWheel
            viewport.addEventListener('wheel', onHoldWheel, {passive:true})

        }

        clearTimeout(restoreScrollingTimeoutIDRef.current)
        restoreScrollingTimeoutIDRef.current = setTimeout(releaseHold,standardMomentumFadeRef.current)

        return hold.count

    }

    const onHoldWheel = (event) => {

        const
            hold = holdRef.current,
            vertical = (orientationRef.current == 'vertical'),
            delta = vertical?event.deltaY:event.deltaX

        if (!delta || event.ctrlKey) return // a cross-axis gesture, or a zoom, is not input to this list's scroll

        if (hold.endOfData && ((delta > 0) != (hold.endOfData == 'tail'))) releaseHold() // away from the held end

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
        hold.keeper?.remove()
        hold.keeper = null
        hold.viewport?.removeEventListener('wheel', hold.onWheel)
        hold.viewport = null
        hold.endOfData = null

    }

    // a hold live at the unmount keeps its wheel listener on the element it was added to, and the timer that would
    // release it is cleared by the scroller's cleanup, so the release is made here
    useEffect(() => () => {
        releaseHold()
        clearTimeout(endStateRef.current.head.gestureTimeoutID)
        clearTimeout(endStateRef.current.tail.gestureTimeoutID)
    }, [])

    // -------------------------[ intersection observations support ]-------------------------

    const adjustForHeadOverflow = () => {

        const
            cradleActual = cradleActualRef.current

        if (!cradleActual.backwardBands) { // reposition

            if (orientationRef.current == 'vertical') {

                viewportRef.current.scrollTo(scrollLeftRef.current,AXIS_START_POSITION)
                scrollTopRef.current = viewportRef.current.scrollTop
                setAxisPosition(0,AXIS_START_POSITION - 1, 'head overflow')

            } else { // 'horizontal'

                viewportRef.current.scrollTo(AXIS_START_POSITION, scrollTopRef.current)
                scrollLeftRef.current = viewportRef.current.scrollLeft
                setAxisPosition(AXIS_START_POSITION - 1,0, 'head overflow')

            }

        } else { // reposition axis to top

            // console.log('SHIFT AXIS BACKWARD (from head overflow)')

            shiftAxis('backward',cradleActual.backwardBands)

        }

        cradleActual.totalCells = cradleActual.forwardCells + cradleActual.backwardCells
        cradleActual.totalBands = cradleActual.forwardBands + cradleActual.backwardBands

    }

    // -------------------------[ the end state, at the head and at the tail ]-------------------------

    // Once the host has answered empty at an end (the fill's one end memory: markQuiet / isQuietAt in useCells) and
    // the viewport has reached the content's edge there, the list is stabilized at the axis: that end's overflow
    // trigger is not consulted, and the scroller moves the viewport only to bring a gesture past the mark back. One
    // state with two ends: the head is the tail's mirror, and nothing below knows one from the other but by the
    // direction it reads in (endGeometry). Two marks meet at an end. The quiet mark is the end memory, the host's
    // answer. The position mark (markFromAxis) is where the viewport's edge rests, kept as a distance from the axis
    // outward: a shift, a reset and a relayout all move the axis with the content, so the mark stays where the content
    // is through them. Being inside the state is the two together: the position mark exists only while the end memory
    // stands, so a trim of the end row, a structural call, a reset, a new cradle or rows at the end leave the state
    // with the memory, with no flag of its own to keep in step. One viewport has one bring-back at a time, whichever
    // end it is for: glidingTo is the scroll position a running smooth scroll is taking the viewport to, and sliding
    // is the slide of the transform that returns a fixed end's stretch ({end, slide}; slideToEndMark). The touch that
    // holds the list, under which none is made, is the fingers that began on the viewport and are still on the screen
    // (touches, by identifier); touchAt is where the one finger of a touch last was ({id, x, y}), which each of its
    // moves is measured from, and inputAt is the time of the last input that is not a scroll event or a finger's
    // move (quietWindowLeft). No placeholder stands at an end for the state's own ask: what the user is shown there
    // is the end indicator, which stands in the content on the end's mark (shown is what it reads at that end: null,
    // 'end', 'failed' or 'searching', and shownAt is the mark it stands on; readEndIndicators)
    const endStateRef = useRef({
        head:{markFromAxis:null, reaskOpen:false, gestureTimeoutID:null, travel:0, drawn:0, short:false, shown:null, shownAt:null},
        tail:{markFromAxis:null, reaskOpen:false, gestureTimeoutID:null, travel:0, drawn:0, short:false, shown:null, shownAt:null},
        glidingTo:null,
        sliding:null,
        touches:new Set(),
        touchAt:null,
        inputAt:-Infinity,
    })

    const directionAt = (end) => (end == 'tail') ? 'forward' : 'backward'

    const endSlack = (end) => ((end == 'tail') && (layoutRef.current == 'variable')) ? END_SLACK : 0

    // the position mark is dropped when the end memory is found gone, unless a re-ask is out: the re-ask cleared the
    // memory itself (reaskOpen while the adjustment has the ask, the open fetch after), and an empty answer stands the
    // state up again on the mark it kept
    const insideEndState = (end) => {

        const state = endStateRef.current[end]

        if (isQuietAt(directionAt(end))) return state.markFromAxis !== null

        if (!state.reaskOpen && !isFetchOpenAt(end)) state.markFromAxis = null

        return false

    }

    // the end stands inside the state and through its re-ask: insideEndState drops the mark when the memory is gone
    // for any other reason, so a mark still held after it is read is the state's or its re-ask's
    const endStands = (end) => insideEndState(end) || (endStateRef.current[end].markFromAxis !== null)

    // an empty headblock still measures a pixel: with no head row the head's dimension is nothing
    const headRowsDimension = () => {

        if (!cradleActualRef.current.backwardCells) return 0

        return (orientationRef.current == 'horizontal') ? headblockRef.current.offsetWidth : headblockRef.current.offsetHeight

    }

    // An end read from the axis outward, toward that end: the content's edge, the viewport's edge on that side, and
    // the scroll position that puts the viewport's edge at a distance (axisAt: the axis position that does, with the
    // viewport left where it is). The tail's distances run forward of the axis and the head's backward of it, which
    // is the whole of the difference between the ends
    const endGeometry = (end) => {

        const
            isH = orientationRef.current == 'horizontal',
            viewport = viewportRef.current,
            axis = isH ? axisPositionRef.current.x : axisPositionRef.current.y,
            headDim = headRowsDimension(),
            tailDim = isH ? tailblockRef.current.offsetWidth : tailblockRef.current.offsetHeight,
            viewportDim = isH ? viewport.clientWidth : viewport.clientHeight,
            scrollPos = isH ? viewport.scrollLeft : viewport.scrollTop

        return (end == 'tail')
            ? {
                isH, axis, viewportDim,
                contentEdge: tailDim,
                viewportEdge: scrollPos + viewportDim - axis,
                scrollPositionAt: (distance) => axis + distance - viewportDim,
                positionAt: (distance) => axis + distance,
                axisAt: (distance) => scrollPos + viewportDim - distance,
            }
            : {
                isH, axis, viewportDim,
                contentEdge: headDim,
                viewportEdge: axis - scrollPos,
                scrollPositionAt: (distance) => axis - distance,
                positionAt: (distance) => axis - distance,
                axisAt: (distance) => scrollPos + distance,
            }

    }

    // An end's rows' edge, from the axis outward. Placeholders standing past the rows there (an ask the end state did
    // not make: the fill that follows a structural call) are not counted, from their first whole band out: a band that
    // rows and placeholders share is the rows' band
    const rowsEdgeAt = (end) => {

        const
            isH = orientationRef.current == 'horizontal',
            portalIDList = portalIDListRef.current,
            isTail = (end == 'tail'),
            block = isTail ? tailblockRef.current : headblockRef.current,
            bands = isTail ? [...tailBandListRef.current].reverse() : headBandListRef.current

        if (!isTail && !cradleActualRef.current.backwardCells) return 0

        let standing = 0

        if (isTail) for (let index = portalIDList.length - 1; index >= 0 && isPlaceholderID(portalIDList[index]); index--) standing++
        else for (let index = 0; index < portalIDList.length && isPlaceholderID(portalIDList[index]); index++) standing++

        let firstBand = null

        for (const band of bands) {

            const cells = band.childElementCount

            if (!cells || cells > standing) break

            standing -= cells
            firstBand = band

        }

        if (!firstBand) return isH ? block.offsetWidth : block.offsetHeight

        const blockRect = block.getBoundingClientRect(), bandRect = firstBand.getBoundingClientRect()

        if (isTail) return isH ? (bandRect.left - blockRect.left) : (bandRect.top - blockRect.top)

        return isH ? (blockRect.right - bandRect.right) : (blockRect.bottom - bandRect.bottom)

    }

    // The viewport's forward edge, from the axis, with its leading edge at the head's rest. The head's repositioning
    // rests the viewport a pixel short of the first row's edge (as isViewportAtEnd reads it); a fixed head rests on
    // that edge, its mark (enterEndState). One line, for the tail's floor (endMark) and its wait for the head
    // (tailWaitsForHead): a list that fits its viewport with both ends fixed then rests on both marks
    const forwardEdgeAtHeadRest = (viewportDim) => (isEndFixed('head') ? 0 : 1) - rowsEdgeAt('head') + viewportDim

    // The mark (markFromAxis) is the rows' edge plus that end's slack, or the previous mark where that is further out:
    // growth moves it on, and a shrink leaves the room the viewport had shown. A viewport whose edge is short of the
    // rows' edge has scrolled back to see the content's end, and the mark is reset to it. One definition: nothing
    // that stands past the rows is in it, so the mark that is read is the mark that is kept. Read only where the end
    // stands, or on entry.
    // A content shorter than the viewport is at its head and its tail at once, and it rests at its head. Where the
    // head stands (its own end state, through its re-ask, or the host's empty answer there), the tail's mark is never
    // short of the viewport's forward edge with its leading edge at the head's rest (forwardEdgeAtHeadRest): a mark
    // the viewport could reach only by going past the head's would have each end bring the viewport back from the
    // other's, in turns, for as long as the list stood. A cradle with rows above still to come is crossed, which is
    // how the head is asked for them
    const endMark = (end) => {

        const
            state = endStateRef.current[end],
            { viewportEdge, viewportDim } = endGeometry(end),
            rowsEdge = rowsEdgeAt(end),
            headStands = (end == 'tail') && (endStands('head') || isQuietAt('backward')),
            floor = Math.max(rowsEdge + endSlack(end), headStands ? forwardEdgeAtHeadRest(viewportDim) : 0)

        state.markFromAxis = (viewportEdge < rowsEdge) ? floor : Math.max(state.markFromAxis ?? floor, floor)

        return state.markFromAxis

    }

    // a shift moves the axis under the content by the moved band's dimension, and each mark stays with the content:
    // the tail's is that much nearer the axis, the head's that much further. An indicator that is shown stands on
    // its mark from the axis, so it is told the mark again
    const keepEndMarksUnderShift = (delta) => {

        const { head, tail } = endStateRef.current

        if (tail.markFromAxis !== null) tail.markFromAxis -= delta
        if (head.markFromAxis !== null) head.markFromAxis += delta

        if ((head.shown !== null) || (tail.shown !== null)) readEndIndicators()

    }

    // the entry's snap: the viewport's edge is put at the mark, instantly
    const snapToEndMark = (end, mark, onlyIfPast) => {

        const
            { isH, viewportEdge, scrollPositionAt } = endGeometry(end),
            position = scrollPositionAt(mark)

        if (onlyIfPast && (viewportEdge <= mark)) return

        // a browser may round the position it is given: the record is what the viewport reports once it is put there
        if (isH) {
            viewportRef.current.scrollTo(position, viewportRef.current.scrollTop)
            scrollLeftRef.current = viewportRef.current.scrollLeft
        } else {
            viewportRef.current.scrollTo(viewportRef.current.scrollLeft, position)
            scrollTopRef.current = viewportRef.current.scrollTop
        }

    }

    // Rows have arrived at an end: it is not the end of the data, and a state standing there is left. Its mark no
    // longer applies, so a return waiting on its timer is dropped and one running is stopped where it is: the
    // viewport is never taken over new rows
    const leaveEndState = (end) => {

        const state = endStateRef.current[end]

        if (state.markFromAxis === null) return

        clearTimeout(state.gestureTimeoutID)
        state.gestureTimeoutID = null
        state.markFromAxis = null

        yieldBringBack()

        readEndIndicators()

    }

    // What the end indicator reads at each end, from the state as it stands: nothing unless the end stands and a gap
    // is open past its mark, which is the viewport's edge past the mark, or the content still sliding back to it (a
    // fixed end's return: the gap is drawn until the slide has finished). Then the end word inside the state
    // ('failed' where the host's last answer there was a failure, which the scroller has no words of its own for),
    // and the searching text while the state's own ask is out (reaskOpen while the adjustment has it, its record in
    // the fill after). An end that stands through any other ask (the fill that follows a structural call, with its
    // placeholders) shows nothing. The indicator stands in the content on the end's mark, outward of it: in the gap,
    // never over a row, and out of sight at rest whatever it reads. The component is told what each end reads and
    // the mark it stands on, only when one of them has changed. Taken at every reading of the viewport and every
    // transition of the state
    const readEndIndicators = () => {

        if (!viewportRef.current) return

        let changed = false

        for (const end of ['head', 'tail']) {

            const
                state = endStateRef.current[end],
                direction = directionAt(end),
                past = endStands(end) && ((endGeometry(end).viewportEdge > endMark(end)) || (endStateRef.current.sliding?.end == end)),
                shown = !past ? null
                    : insideEndState(end) ? ((quietReasonAt(direction) == 'failed') ? 'failed' : 'end')
                    : (state.reaskOpen || isEndAskAt(direction)) ? 'searching' : null,
                shownAt = (shown === null) ? null : endMark(end)

            if ((shown !== state.shown) || (shownAt !== state.shownAt)) {
                state.shown = shown
                state.shownAt = shownAt
                changed = true
            }

        }

        if (changed) setEndIndicators(
            {head:endStateRef.current.head.shown, tail:endStateRef.current.tail.shown},
            {head:endStateRef.current.head.shownAt, tail:endStateRef.current.tail.shownAt},
        )

    }

    // Entry, once. The end is marked where the answer did not mark it (the inline fill's empty answer at cap 0 marks
    // nothing at the tail, and the trigger's inference from a cradle still short after the fill is the end). The
    // viewport is snapped to the mark (only when it is past it, where the caller says so: a list opened or arrived at
    // on its first row is not moved) and, under input, held to stop its momentum: the plain hold, with
    // no quiet window and no wheel cancelling, since the state does from here what a longer hold would. A re-entry
    // during a bring-back neither snaps nor holds: the smooth scroll is already taking the viewport to the mark. An
    // answer that stands the state up again on a kept mark reads the viewport against it: one still past the mark is
    // returned to it.
    // A fixed head rests on its mark. The mount and the head's repositioning rest the viewport a pixel short of the
    // first row (isViewportAtEnd), which keeps the head's triggers before the viewport while the head may still
    // bring rows. From the entry they are not consulted, and a pull is taken from the mark and from no pixel short
    // of it (takeEndInput), so the pixel is given up here: the axis is put under the viewport, as an arrival seats
    // it (drawEndElastic), and the viewport is not scrolled. The content moves by that pixel, once. A viewport that
    // is further from the mark has scrolled there, is left where it is, and arrives. The tail has no such pixel
    const enterEndState = (end, onlyIfPast) => {

        const direction = directionAt(end)

        if (!isQuietAt(direction)) markQuiet(direction, 'end')

        if (insideEndState(end)) {

            readViewportAtEnd(end, false)
            readEndIndicators()
            return

        }

        const mark = endMark(end)

        if (endStateRef.current.glidingTo === null) {

            snapToEndMark(end, mark, onlyIfPast)

            if ((end == 'head') && isEndFixed(end) && isViewportAtEnd(end) && (endGeometry(end).viewportEdge < mark)) {

                const { isH, axisAt } = endGeometry(end), seat = Math.floor(axisAt(mark))

                setAxisPosition(isH ? seat : 0, isH ? 0 : seat)
                readEndElastic(end)

            }

            if (holdRef.current.viewport || isScrollInputRecent()) holdScrolling(end)

        }

        readEndIndicators()

    }

    // What is left of the quiet window. A gesture has ended when no input has arrived for SHORT_MOMENTUM_FADE: a
    // wheel or a momentum scroll has no event that ends it, so the time since the last input is the only sign. Input
    // is a scroll event of the list (the component keeps the time of each), a wheel along its axis, a touch's start,
    // and the last of its fingers lifting (inputAt)
    const quietWindowLeft = () => {

        const lastInput = Math.max(lastScrollEventTimeRef.current, endStateRef.current.inputAt)

        return shortMomentumFadeRef.current - (performance.now() - lastInput)

    }

    // Every unpinned scroll event reads the viewport against the mark of each end it is inside the state at. A
    // gesture past the mark is brought back once the input has faded (SHORT_MOMENTUM_FADE from the last scroll
    // event), not fought while it runs; a gesture that comes back inside the mark by itself owes nothing. The ask is
    // the gesture's, and the scroll events' reading is the only one that carries it. A bring-back's own scroll events
    // are not a gesture, and a held viewport is read by nothing: the mode's end re-reads the viewport for them
    // (onEndScrollingModeEnd), so no reading is dropped.
    //
    // Every other reading is the same one without the ask: an answer that stands the state up again (enterEndState),
    // the mode's end, the end of a touch, a bring-back stopped for input, the timer of an earlier one. It is taken
    // wherever the end stands, so also while a re-ask is out, against the same mark. It waits only what is left of
    // the quiet window, and the timer it leaves decides nothing: it takes the reading again. With none left it
    // returns the viewport (returnToEndMark). During a bring-back there is nothing to wait out: no hand is on the
    // list while one runs (input ends it), and the mark the scroll is running to may no longer be the mark. A
    // bring-back a gesture has already scheduled stands, with its ask
    const readViewportAtEnd = (end, ask, inTask = false) => {

        const state = endStateRef.current[end]

        if (holdRef.current.viewport || !(ask ? insideEndState(end) : endStands(end))) return

        if (ask && (endStateRef.current.glidingTo !== null)) return

        if (!ask && (state.gestureTimeoutID !== null)) return

        const
            mark = endMark(end),
            { viewportEdge } = endGeometry(end)

        clearTimeout(state.gestureTimeoutID)
        state.gestureTimeoutID = null

        if (viewportEdge <= mark) return

        const wait = ask
            ? shortMomentumFadeRef.current
            : (endStateRef.current.glidingTo !== null) ? 0 : quietWindowLeft()

        if (wait > 0) state.gestureTimeoutID = setTimeout(() => bringBackToEndMark(end, ask), wait)
        else if (inTask) glideToEndMark(end)
        else returnToEndMark(end)

    }

    // The return of a viewport past a mark without an ask is a task of the queue, like every other act on the list:
    // a re-ask or an answer waiting its turn ahead of it goes first, and the reading is taken again as the task runs,
    // against the list as it stands then
    const returnToEndMark = (end) => {

        const returnTask = async () => {

            try {

                if (viewportRef.current) readViewportAtEnd(end, false, true)

            } finally {

                requestIntersectionsConnect()

            }

        }

        DOMManipulationQueue.enqueue(returnTask).catch((error) => {

            if (!viewportRef.current) return

            reportError(callbacksRef, 'returnToEndMark', errorMessage(error), [end])

        })

    }

    // The tail's mark has a floor that reads the head (endMark): a list that fits its viewport rests at its head. While
    // the head is being asked and the cradle's rows fit the viewport, the host's answer there says whether the tail's
    // mark is its rows' edge or that floor, so a reading of the tail taken for the list (not for a gesture) waits for
    // the answer, and is taken again after it (rereadTailAfterHead)
    const tailWaitsForHead = () => {

        const { viewportDim } = endGeometry('tail')

        return isFetchOpenAt('head') && !isQuietAt('backward') &&
            (forwardEdgeAtHeadRest(viewportDim) > (rowsEdgeAt('tail') + endSlack('tail')))

    }

    // The rest after a resize of the viewport, read as the resize's own task ends, once its layout and its fill are
    // done. A resize holds the cell at the axis where it is, so an end that stands can be left with the viewport past
    // its mark, and no scroll says so. After a re-band (the cells per band changed) the rows at each end are other
    // rows: each standing end's mark is entered again from its rows' edge, never carried across; the head first, as
    // the tail's floor reads it. A viewport past a mark then comes back by the return a gesture's end takes; one short
    // of its mark stays where the resize left it. The elastic's numbers are read where the resize left the viewport,
    // before either: the scroll that follows is measured from there, and one from short of the mark arrives at it
    const readEndsAfterResize = (rebanded) => {

        if (!viewportRef.current) return

        for (const end of ['head', 'tail']) {

            if (!endStands(end)) continue

            if (rebanded) {

                endStateRef.current[end].markFromAxis = null
                endMark(end)

            }

            readEndElastic(end)

            if ((end == 'tail') && tailWaitsForHead()) continue

            readViewportAtEnd(end, false, true)

        }

        readEndIndicators()

    }

    // An answer at the head may be the one a reading of the tail waited for. The tail is read again in a task of the
    // queue, which runs after the answer's own: it reads the head as the answer left it, and waits again where the
    // head is asked again
    const rereadTailAfterHead = () => {

        if (!endStands('tail')) return

        const rereadTask = async () => {

            try {

                if (viewportRef.current && !tailWaitsForHead()) readViewportAtEnd('tail', false, true)

            } finally {

                requestIntersectionsConnect()

            }

        }

        DOMManipulationQueue.enqueue(rereadTask).catch((error) => {

            if (!viewportRef.current) return

            reportError(callbacksRef, 'rereadTailAfterHead', errorMessage(error), [])

        })

    }

    // The pull past a fixed end is a small elastic, carried by the axis: the gap between the mark and the viewport's
    // edge is cap·t / (t + cap) of the travel t (one for one at the mark, never the cap), and travel back toward the
    // mark is drawn one for one, so the content follows the hand home, and a pull that turns outward again is damped
    // from where the content stands. The curve and its inverse are read wherever a gap is drawn or found
    const endElasticCap = (viewportDim) => Math.min(END_ELASTIC_CAP, viewportDim / 10)

    const elasticTravelAt = (gap, cap) => (gap <= 0) ? gap : (gap < cap) ? cap * gap / (cap - gap) : Infinity

    const elasticGapAt = (travel, cap) => (travel <= 0) ? travel : (travel < Infinity) ? cap * travel / (travel + cap) : cap

    // A pull the browser makes at a fixed end (one the scroller could not take) is drawn on the same curve: a scroll
    // that begins at rest on the mark, within the pixel the axis is seated on, and every scroll after it for as long
    // as the pull stands (travel). Any other scroll that carries the viewport past the mark arrives there, as a
    // scroll arrives at an end whose answer comes back empty: one in flight, and one that came from a pixel or more
    // short of the mark (short, the reading the last scroll left). The axis is put where the content's edge is on
    // the mark under the viewport, as the return leaves it, and the scroll is held: a momentum is the compositor's,
    // and a write of the axis in its scroll events is a frame behind it. Past the mark the scroll position travels as the
    // browser scrolls it, and the axis goes with it, short of the part of the travel that is drawn. Here the axis
    // moves by whole pixels, as a shift moves it, and never draws past the curve; the travel is kept unrounded, so a
    // slow pull adds up as a fast one does. A gap the elastic did not draw (a viewport found out past the cap) is
    // not pulled in: it stops growing. The write is made in the scroll event, outside the queue, so that the content
    // is drawn where the hand is in the event's own frame: every write of the axis reads it in the same turn, so
    // none is lost to this one. A viewport the browser has brought to the mark or inside it, over an axis a pull
    // left between pixels, has its axis put on a whole one (settleAxisAtEnd)
    const drawEndElastic = (end) => {

        const state = endStateRef.current[end]

        if (!isEndFixed(end) || !insideEndState(end)) {
            state.travel = state.drawn = 0
            state.short = false
            return
        }

        const
            { isH, axis, viewportDim, viewportEdge, axisAt } = endGeometry(end),
            past = viewportEdge - endMark(end),
            gap = Math.max(past, 0),
            cap = endElasticCap(viewportDim),
            moved = gap - state.drawn

        if (moved <= 0) {
            state.drawn = gap
            state.travel = elasticTravelAt(gap, cap)
            state.short = past <= -1
            if (!gap && !Number.isInteger(axis)) settleAxisAtEnd(end)
            return
        }

        if (!state.travel && (state.short || isScrollInputRecent())) {

            const rest = axisAt(endMark(end)), seat = (end == 'tail') ? Math.ceil(rest) : Math.floor(rest)

            setAxisPosition(isH ? seat : 0, isH ? 0 : seat)
            readEndElastic(end)
            holdScrolling(end)

            return

        }

        const
            travel = state.travel + moved,
            damped = elasticGapAt(travel, cap),
            along = Math.ceil(gap - Math.max(damped, state.drawn)),
            position = axis + ((end == 'tail') ? along : -along)

        setAxisPosition(isH ? position : 0, isH ? 0 : position)

        state.travel = travel
        state.drawn = gap - along

    }

    // the elastic's numbers, read again from where the content stands: the scroller has moved the transform itself
    // (a pull it took, a return, an arrival, a slide taken up) or a resize has moved the viewport's edge, and the
    // next scroll event is measured from there
    const readEndElastic = (end) => {

        const state = endStateRef.current[end]

        if (!isEndFixed(end) || !insideEndState(end)) {
            state.travel = state.drawn = 0
            state.short = false
            return
        }

        const
            { viewportDim, viewportEdge } = endGeometry(end),
            past = viewportEdge - endMark(end),
            gap = Math.max(past, 0)

        state.drawn = gap
        state.travel = elasticTravelAt(gap, endElasticCap(viewportDim))
        state.short = past <= -1

    }

    // A stretch is drawn between pixels, and a pull back that the browser takes over (takeEndInput) scrolls on from
    // there. The axis is put on its whole pixel, toward the content, once the viewport is at the mark or inside it:
    // by less than a pixel, in its turn of the queue, read again as it runs
    const settleAxisAtEnd = (end) => {

        const settleTask = async () => {

            try {

                if (!viewportRef.current || !isEndFixed(end) || !insideEndState(end)) return

                const
                    { isH, axis, viewportEdge } = endGeometry(end),
                    position = (end == 'tail') ? Math.ceil(axis) : Math.floor(axis)

                if ((viewportEdge > endMark(end)) || (position === axis)) return

                setAxisPosition(isH ? position : 0, isH ? 0 : position)

            } finally {

                requestIntersectionsConnect()

            }

        }

        DOMManipulationQueue.enqueue(settleTask).catch((error) => {

            if (!viewportRef.current) return

            reportError(callbacksRef, 'settleAxisAtEnd', errorMessage(error), [end])

        })

    }

    // An element between the input's target and the viewport that can itself scroll the way the input goes: the
    // input is that element's (a scrolling area inside a row), as the browser would have it
    const scrollsWithin = (target, delta) => {

        const isH = orientationRef.current == 'horizontal'

        for (let element = target; element && (element !== viewportRef.current); element = element.parentElement) {

            const
                room = isH ? (element.scrollWidth - element.clientWidth) : (element.scrollHeight - element.clientHeight),
                position = isH ? element.scrollLeft : element.scrollTop

            if ((room <= 0) || !((delta < 0) ? (position > 0) : (position < room))) continue

            const overflow = getComputedStyle(element)[isH ? 'overflowX' : 'overflowY']

            if ((overflow == 'auto') || (overflow == 'scroll')) return true

        }

        return false

    }

    // A pull that starts at a fixed end's mark is the scroller's, taken before the browser scrolls for it: the
    // browser's own answer to a scroll past the mark is one the elastic can only follow, a frame behind (the scroll
    // is drawn, then the axis is moved under it). Taken, the input moves the transform alone (stretchEnd), and the
    // scroll position stays where it is. It is read at the moment of the input: the end is fixed and stands, the
    // viewport's edge is at the mark (within the pixel the axis rests on) and the input goes outward along the list,
    // with nothing between its target and the viewport to scroll instead. While a stretch stands every input is the
    // scroller's, until one goes back past the mark: that one, and what follows it, is the browser's, which scrolls
    // on from where the content is. An input that cannot be cancelled, one under a hold, and one that arrives while
    // a task has the queue are left to the browser as they were: the list is never made to wait for a pull
    const takeEndInput = (event, delta, across) => {

        if (!event.cancelable || holdRef.current.viewport || DOMManipulationQueue.isBusy()) return

        for (const end of ['head', 'tail']) {

            if (!isEndFixed(end) || !insideEndState(end)) continue

            const
                outward = (end == 'tail') ? delta : -delta,
                gap = endGeometry(end).viewportEdge - endMark(end),
                taken = (gap > 0)
                    ? (gap + outward > 0)
                    : (gap > -1) && (outward > 0) && (Math.abs(across) <= Math.abs(delta)) && !scrollsWithin(event.target, delta)

            if (!taken) continue

            event.preventDefault()

            if (outward) stretchEnd(end, outward)

            return

        }

    }

    // The stretch of a taken input, a task of the queue like every other act on the list; the queue is idle when an
    // input is taken, so it runs in the input's own event. Outward, the input is added to the travel the gap stands
    // for and drawn on the curve; back toward the content, it is drawn one for one, as far as the mark. A slide
    // still under way is taken up first, so the stretch goes on from where the content is drawn. The gap is read
    // from the list as the task runs, and the return is left to the reading every scroll event takes: it is made
    // when the input has faded
    const stretchEnd = (end, outward) => {

        const stretchTask = async () => {

            try {

                if (!viewportRef.current || holdRef.current.viewport || !isEndFixed(end) || !insideEndState(end)) return

                foldSlide()

                const
                    { isH, viewportDim, viewportEdge, axisAt } = endGeometry(end),
                    mark = endMark(end),
                    gap = viewportEdge - mark

                if (gap <= -1) return

                const
                    cap = endElasticCap(viewportDim),
                    stretched = (outward > 0)
                        ? Math.max(elasticGapAt(elasticTravelAt(gap, cap) + outward, cap), gap)
                        : Math.max(gap + outward, Math.min(gap, 0)),
                    position = axisAt(mark + stretched)

                setAxisPosition(isH ? position : 0, isH ? 0 : position)

                readEndElastic(end)
                readViewportAtEnd(end, true)
                readEndIndicators()

            } finally {

                requestIntersectionsConnect()

            }

        }

        DOMManipulationQueue.enqueue(stretchTask).catch((error) => {

            if (!viewportRef.current) return

            reportError(callbacksRef, 'stretchEnd', errorMessage(error), [end])

        })

    }

    const onEndScroll = () => {

        drawEndElastic('head')
        drawEndElastic('tail')

        readViewportAtEnd('head', true)
        readViewportAtEnd('tail', true)

        readEndIndicators()

    }

    const rereadEnds = () => {

        readViewportAtEnd('head', false)
        readViewportAtEnd('tail', false)

        readEndIndicators()

    }

    // the scrolling mode's end is the end of any bring-back, completed or not: a viewport it left past a mark is read
    // here. A scroll made as the scrolling ended, whose scroll event the reset of the scroll position has left with
    // nothing to report, is a gesture nothing else will read: it is read first, as its event would have been, so
    // that during a bring-back it is the bring-back's own
    const onEndScrollingModeEnd = (scrollUnheard) => {

        if (scrollUnheard) onEndScroll()
        endStateRef.current.glidingTo = null
        rereadEnds()

    }

    // A gesture past the mark asks that end once more, and the viewport is brought back to the mark with a smooth
    // scroll: the gesture into the end is the user asking for more. Nothing is placed at the end for that ask: the
    // end indicator reads the searching text while it is out and the viewport is still past the mark (reaskEnd). Rows
    // answered are added at the end and leave the state (leaveEndState). An empty or failed answer stands the state
    // up again on the mark it kept, and a viewport the answer finds past it is returned by a reading that does not ask
    // again. This is the timer's end: a gesture's sends its ask, and any other takes the reading again. An end the
    // host has fixed (operations.fixedEnds) is not asked: its gesture is brought back by the reading that asks nothing
    const bringBackToEndMark = (end, ask) => {

        endStateRef.current[end].gestureTimeoutID = null

        if (!viewportRef.current) return

        if (!ask || isEndFixed(end)) readViewportAtEnd(end, false)
        else if (insideEndState(end)) reaskEnd(end)

    }

    // The bring-back of a viewport past the mark, where the end stands: made inside a task of the queue (the
    // re-ask's, the return's). A reading taken in the meantime would bring the viewport back a second time, so its
    // timer is taken up here. At an end the host has fixed, read as the bring-back is made, the content is slid back
    // by the transform (slideToEndMark); at any other the viewport is scrolled back smoothly, and a scroll already
    // running to the same position is not started again. None is made under a held touch: the list stays where the
    // finger holds it, and the touch's end reads the viewport (onEndTouchEnd)
    const glideToEndMark = (end) => {

        const state = endStateRef.current[end]

        clearTimeout(state.gestureTimeoutID)
        state.gestureTimeoutID = null

        if (!viewportRef.current || !endStands(end) || endStateRef.current.touches.size) return

        const
            mark = endMark(end),
            { isH, viewportEdge, scrollPositionAt } = endGeometry(end),
            position = scrollPositionAt(mark)

        if (viewportEdge <= mark) return

        if (isEndFixed(end)) {
            slideToEndMark(end)
            return
        }

        if (endStateRef.current.glidingTo === position) return

        endStateRef.current.glidingTo = position
        viewportRef.current.scrollTo(isH ? {left:position, behavior:'smooth'} : {top:position, behavior:'smooth'})

    }

    // The return of a fixed end's stretch. The axis is put where the viewport's edge is on the mark, on a whole
    // pixel, at once: the list is at rest there for everything that reads it. What the user sees is the slide: the
    // transform is drawn from where the content stood to where it now is, by the browser, with no scroll and no
    // write of ours between its two ends. The gap is still drawn while it runs, so the indicator stands until the
    // slide's own end, which is the one thing that follows it
    const slideToEndMark = (end) => {

        foldSlide()

        const
            { isH, axis, axisAt } = endGeometry(end),
            rest = axisAt(endMark(end)),
            position = (end == 'tail') ? Math.ceil(rest) : Math.floor(rest)

        setAxisPosition(isH ? position : 0, isH ? 0 : position)

        readEndElastic(end)

        const slide = slideAxis(isH ? axis - position : 0, isH ? 0 : axis - position, END_RETURN)

        endStateRef.current.sliding = {end, slide}

        slide.finished.then(() => {

            if (endStateRef.current.sliding?.slide !== slide) return

            endStateRef.current.sliding = null

            if (viewportRef.current) readEndIndicators()

        }, () => {})

    }

    // A slide under way is taken up where it has reached: the axis is put where the slide draws the content at this
    // moment, and the slide is ended, so the content does not move as the hand takes it. What is left of the slide
    // is read before it is ended
    const foldSlide = () => {

        const sliding = endStateRef.current.sliding

        if (sliding === null) return false

        const left = readAxisSlide()

        endStateRef.current.sliding = null
        sliding.slide.cancel()

        setAxisPosition(axisPositionRef.current.x + left.x, axisPositionRef.current.y + left.y)

        readEndElastic(sliding.end)

        return true

    }

    // Input during a bring-back. The user's hand has the list: a smooth scroll is ended where it is (an instant
    // scroll to the position it has reached ends it) and a slide is taken up where it has reached (foldSlide), in
    // the event itself, not on a turn of the queue, since the hand does not wait. The viewport is read again, so
    // one the input leaves past a mark is brought back when the input is over
    const yieldBringBack = () => {

        const
            state = endStateRef.current,
            viewport = viewportRef.current

        if (!viewport) return

        const folded = foldSlide()

        if (!folded && (state.glidingTo === null)) return

        if (state.glidingTo !== null) {
            viewport.scrollTo(viewport.scrollLeft, viewport.scrollTop)
            state.glidingTo = null
        }

        rereadEnds()

    }

    const isBringingBack = () => endStateRef.current.glidingTo !== null

    // A wheel along the list's axis is input; one across it, or a pinch, does not scroll this list. A wheel measured
    // in pixels is offered to the take, whichever way it goes: one across the list is still the scroller's while a
    // stretch stands
    const onEndWheel = (event) => {

        const
            isV = orientationRef.current == 'vertical',
            delta = isV ? event.deltaY : event.deltaX

        if (event.ctrlKey) return

        if (delta) {

            endStateRef.current.inputAt = performance.now()

            yieldBringBack()

        }

        if (event.deltaMode === 0) takeEndInput(event, delta, isV ? event.deltaX : event.deltaY)

    }

    // Every touch event lists the fingers on the screen, wherever they began: the viewport's own are kept only
    // while they are among them, so a finger whose end was never heard is let go at the next touch event heard
    const keepTouchesOnScreen = (event) => {

        const
            { touches } = endStateRef.current,
            onScreen = new Set()

        for (let index = 0; index < event.touches.length; index++) onScreen.add(event.touches[index].identifier)

        for (const identifier of touches) if (!onScreen.has(identifier)) touches.delete(identifier)

    }

    // A touch's events go to the element it began on, and go on going there when that element has left the document
    // (a cell recycled under the finger), where they no longer pass through the viewport: the end of the touch is
    // listened for on its own target
    const onEndTouchStart = (event) => {

        const state = endStateRef.current

        keepTouchesOnScreen(event)

        for (let index = 0; index < event.changedTouches.length; index++) state.touches.add(event.changedTouches[index].identifier)

        state.touchAt = (event.touches.length == 1) ? {id:event.touches[0].identifier, x:event.touches[0].clientX, y:event.touches[0].clientY} : null

        state.inputAt = performance.now()

        event.target.addEventListener('touchend', onEndTouchEnd, {passive:true})
        event.target.addEventListener('touchcancel', onEndTouchEnd, {passive:true})

        yieldBringBack()

    }

    // A finger's move, measured from where that finger last was and offered to the take as a wheel's travel is. Two
    // fingers on the screen measure nothing: that is a pinch, or a second hand
    const onEndTouchMove = (event) => {

        const
            state = endStateRef.current,
            isH = orientationRef.current == 'horizontal',
            last = state.touchAt,
            touch = event.touches[0]

        state.touchAt = (event.touches.length == 1) ? {id:touch.identifier, x:touch.clientX, y:touch.clientY} : null

        if (!last || !state.touchAt || (last.id !== state.touchAt.id)) return

        const
            dx = last.x - touch.clientX,
            dy = last.y - touch.clientY

        takeEndInput(event, isH ? dx : dy, isH ? dy : dx)

    }

    // A finger lifted. The element is listened to until the last finger on it has gone; the touch has ended when
    // the last of the viewport's fingers has, and that lift is the gesture's last input: the viewport is read now
    const onEndTouchEnd = (event) => {

        const state = endStateRef.current

        keepTouchesOnScreen(event)

        if (!event.targetTouches.length) {

            event.currentTarget.removeEventListener('touchend', onEndTouchEnd)
            event.currentTarget.removeEventListener('touchcancel', onEndTouchEnd)

        }

        if (state.touches.size) return

        state.inputAt = performance.now()

        if (viewportRef.current) rereadEnds()

    }

    // The re-ask goes through the overflow adjustment, whose answer is the entry's (an inline empty answer at cap 0
    // enters by its inference, as at the trigger). The end memory is cleared inside the task, so that nothing reads
    // the state between the clearing and the ask; the adjustment closes reaskOpen with its answer. The fill sends the
    // ask before it first waits, with nothing placed at the end for it, and the bring-back is made then, before the
    // answer is waited for: a host slow to answer does not keep the viewport out past the end (a viewport that goes
    // out past the mark while the answer is out is read as anywhere the end stands)
    const reaskEnd = (end) => {

        endStateRef.current[end].reaskOpen = true

        const task = async () => {

            assertIntersectionsDisconnect()

            try {

                clearQuietAt(end)

                readEndIndicators()

                const answered = adjustForEndOverflow(end, true)

                glideToEndMark(end)

                await answered

            } finally {

                requestIntersectionsConnect()

            }

        }

        DOMManipulationQueue.enqueue(task).catch((error) => {

            if (!viewportRef.current) return

            reportError(callbacksRef, 'reaskEnd', errorMessage(error), [end])

        })

    }

    // An end's overflow, and its re-ask: true when the end of the data is there and the state was entered. The fill
    // asks where the end is not known (with the quiet mark standing, an answer that came while the viewport was still
    // short of the end, it asks nothing there), and rows that arrive, or a fetch left open (its answer settles the
    // end when it comes), settle nothing here; rows that the fill itself brought, with no fetch left open, were
    // answered inline, and leave a state standing at that end. A cradle at its potential with
    // nothing to ask for was outrun, not ended: the rows ahead answer that, by the shift the caller measures and the
    // outrun branch on the next observation. A cradle still short after the fill with no fetch open was answered
    // inline with nothing, which is the end
    const adjustForEndOverflow = async (end, onlyIfPast) => {

        try {

            const
                direction = directionAt(end),
                cellsAtEnd = () => (end == 'tail') ? cradleActualRef.current.forwardCells : cradleActualRef.current.backwardCells,
                cellsBefore = cellsAtEnd()

            await fillCradle()

            if (!isFetchOpenAt(end) && (cellsAtEnd() > cellsBefore)) leaveEndState(end)

            if (cellsAtEnd() > cellsBefore || isFetchOpenAt(end)) return false

            if (!isQuietAt(direction) && !isCradleShortAt(end)) return false

            enterEndState(end, onlyIfPast)

            return true

        } finally {

            endStateRef.current[end].reaskOpen = false

            readEndIndicators()

        }

    }

    // for getCradleSpecs: at each end, whether the list is in the end state there, and the mark it rests at
    const endStateReport = () => {

        const report = (end) => {

            const
                inside = insideEndState(end),
                slack = endSlack(end)

            if (!inside || !viewportRef.current) return {inside, mark:null, slack, contentEdge:null}

            const
                mark = endMark(end),
                { contentEdge, positionAt } = endGeometry(end)

            return {inside, mark:positionAt(mark), slack, contentEdge:positionAt(contentEdge)}

        }

        return {head:report('head'), tail:report('tail')}

    }

    // The host answered an ask at an end. With rows (a placeholder run's answer that placed some, or the rows the end
    // state's own ask added): a state standing at that end is left. With nothing, or with a failure, from two
    // callers: an answer with placeholders on, which arrives after the fill that asked had returned and takes down
    // what stood at that end for it, and, with placeholders off, the inline fill's empty answer to 'before'. A
    // viewport still bands away from that end has rows to scroll into, and the overflow there enters the state when
    // it arrives: nothing is held short of them. At the end the answer enters the end state (the entry snaps a
    // viewport past the mark, and holds under input); the end memory keeps a failure as it keeps an empty answer, and
    // the state's re-ask is how the host is asked again
    onRunEndedRef.current = (direction, reason) => {

        if (!viewportRef.current) return

        const
            end = (direction == 'forward')?'tail':'head',
            hold = holdRef.current

        if (end == 'head') rereadTailAfterHead()

        if (reason == 'rows') {

            leaveEndState(end)
            return

        }

        if (hold.viewport && hold.endOfData && (hold.endOfData != end)) return // held at the other end

        if (!isViewportAtEnd(end)) return

        // the answer's reason is the end's memory from here, so the entry's reading of the indicator has it (a failed
        // answer reads as failed at once); the answer's caller marks again after the snap the entry may make
        markQuiet(direction, reason)

        enterEndState(end, true)

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
                    keepEndMarksUnderShift(movedHeight)

                } else { // horizontal}

                    const 
                        currentPx = axisPositionRef.current.x,
                        movedWidth = forwardFirstBand.offsetWidth

                    setAxisPosition(currentPx + movedWidth,0)
                    keepEndMarksUnderShift(movedWidth)

                }

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
                    keepEndMarksUnderShift(-movedHeight)

                } else { // horizontal

                    const 
                        currentPx = axisPositionRef.current.x,
                        movedWidth = backwardFirstBand.offsetWidth

                    setAxisPosition(currentPx - movedWidth, 0)
                    keepEndMarksUnderShift(-movedWidth)

                }

            }

        }

        trimCradle()

        updateCurrentAxisReferenceID()

    }

    return {
        evaluateIntersections, followViewport, bringOutrunCradle, onEndScroll, onEndScrollingModeEnd, onEndWheel, onEndTouchStart,
        onEndTouchMove, isBringingBack, endStateReport, readEndsAfterResize,
    }

}

export default useIntersections