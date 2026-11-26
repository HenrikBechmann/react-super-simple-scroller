// ReactSuperSimpleScroller.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

/*
    TODO
    - report null axisReferenceID, including...
        - for failure of seedReferenceID
*/

// ===============================[ resources ]========================

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, CSSProperties, ReactElement } from 'react'

import { ErrorBoundary } from "react-error-boundary"

import Queue from './Queue'

import { SCROLLBLOCK_SPAN } from './orientationStyles'

// sub-modules
import { isValidID, reportError, reportWarning, errorMessage } from './utilities'
import { createCellScrollState, recordCellScroll, restoreCellScroll } from './cellScroll'
import useCells from './useCells'
import { createPlaceholderState, DEFAULT_FETCH_CEILING } from './placeholders'
import { createEndMachine } from './endMachine'
import useNewCradlePotential from './useNewCradlePotential'
import useRemoveCells from './useRemoveCells'
import useIntersections from './useIntersections'
import useReset from './useReset'
import useCalls from './useCalls'

import { selectStyles, selectViewportStyles } from './orientationStyles'
import { 
    baseCradleActual, 
    DEFAULT_SPACING,
    ORIENTATIONS,
    LAYOUTS,
    validateOption,
    validateSpacing,
    validateCellDimensions,
    observeCradleAlignment,
} from './utilities'

const
    AXIS_START_POSITION = SCROLLBLOCK_SPAN/2,

    // defaults for technical and operations.runway, which each scroller reads from its own props
    DEFAULT_STANDARD_SCROLL_MOMENTUM_FADE = 700,
    DEFAULT_SHORT_MOMENTUM_FADE = 200,
    DEFAULT_RUNWAY_BANDS = 4,

    // what a call made after unmount answers: the promise-returning calls resolve false, the readers their empty
    // shape, and every other call false
    UNMOUNTED_ANSWERS = {
        insert: Promise.resolve(false),
        remove: Promise.resolve(false),
        move: Promise.resolve(false),
        replace: Promise.resolve(false),
        fetchCradleCells: Promise.resolve(false),
        restoreScrollPositions: Promise.resolve(false),
        getCradleIDList: [],
        getCradleSpecs: null,
    }

// ===============================[ styles ]==========================

// common styles

const virtualCradleStyles = {
    display: 'none',
} as CSSProperties

// An end indicator stands in the scrolled content, in the axis: on its end's mark (a distance from the axis) and
// outward from it, the start's reaching up from its mark (left, in a horizontal list) and the end's down (right).
// So it is in the gap a pull opens past that end and nowhere else: at rest the viewport's edge is on the mark or
// short of it, and no row stands past it. It takes no pointer events
const endIndicatorSlotStyles = (end, orientation, mark) => {

    const isHead = (end == 'head')

    return ((orientation == 'horizontal')
        ? {position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', ...(isHead ? {right: mark} : {left: mark})}
        : {position: 'absolute', left: 0, right: 0, pointerEvents: 'none', ...(isHead ? {bottom: mark} : {top: mark})}) as CSSProperties

}

// note: remaining styles are in orientationStyles.tsx

function fallbackRender({ error, resetErrorBoundary }) {

  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <p style={{ color: "red" }}>{error.message}</p>
    </div>
  );
}

// ==========================[ component ]============================

const Viewport = (props) =>{

    // ===============================[ data ]==========================

    const 

        // generage throw new Error if necessary
        [errorState, setErrorState] = useState({error:false, message: null}),

        // persist default identities
        defaultCallbacksRef = useRef({}),
        defaultSpacingRef = useRef({}),
        defaultOperationsRef = useRef({}),

        // host data
        {
            orientation: hostOrientation,
            layout: hostLayout,
            cellDimensions: hostCellDimensions,
            seedReferenceID, 
            fetchCells,
            callbacks = defaultCallbacksRef.current, 
            calls,
            spacing = defaultSpacingRef.current,
            operations = defaultOperationsRef.current,
            technical,
            scrollerName = 'not named'
        } = props,

        // orientation and layout are checked where they enter, and everything below reads the checked value; an
        // unknown value is replaced by the last good one here, and reported by an effect below
        lastGoodOrientationRef = useRef(null),
        lastGoodLayoutRef = useRef(null),
        orientationCheck = useMemo(()=>{

            return validateOption('orientation', hostOrientation, ORIENTATIONS, lastGoodOrientationRef.current)

        },[hostOrientation]),
        layoutCheck = useMemo(()=>{

            return validateOption('layout', hostLayout, LAYOUTS, lastGoodLayoutRef.current)

        },[hostLayout]),
        orientation = orientationCheck.value,
        layout = layoutCheck.value,

        // processing control
        // a task that has waited behind one running task for the queue's stall time is reported: a nested
        // enqueue (a fetchCells that awaits one of the calls) never finishes, and this is how it shows
        DOMManipulationQueueRef = useRef(new Queue({
            onStall: ({ waitedMs, waiting }) => {
                const message = `a cradle operation has waited ${waitedMs} ms behind one that has not finished (${waiting} waiting). ` +
                    'A task that enqueues another task on the same queue and awaits it never finishes: a fetchCells that awaits ' +
                    'insert, remove, move, replace, fetchCradleCells or restoreScrollPositions before it returns is that shape'
                reportWarning(callbacksRef, 'queue', message, [], { waitedMs, waiting })
            },
            // a reconnect asked for during a cradle task is refused while the queue is busy, and the queue is the one
            // writer that knows when it has drained: it ticks the flush below, which connects after the task's commit
            onIdle: () => {
                if (intersectionsConnectWantedRef.current && isMountedRef.current) setConnectTick(tick => tick + 1)
            },
            // calls still waiting at the unmount are answered false and not run, as a call made after it is
            onDropped: ({ labels }) => {
                if (unmountedCallWarnedRef.current) return
                unmountedCallWarnedRef.current = true
                reportWarning(callbacksRef, labels[0], 'queued before the scroller was unmounted; nothing was done', [], { dropped: labels })
            },
        })),
        intersectionsConnectedRef = useRef(false),
        intersectionsConnectWantedRef = useRef(false), // a reconnect asked for and not yet made
        // true from the lifecycle effect's run to its cleanup; a call made outside that span is refused
        isMountedRef = useRef(false),
        unmountedCallWarnedRef = useRef(false),

        // comparisons with the following lead to reset; the validated values are written on their first validation,
        // so the first layout compares equal and is a mount, not a reconfiguration
        previousOrientationRef = useRef(orientation),
        previousLayoutRef = useRef(layout),
        previousCellDimensionsRef = useRef(null),
        previousSpacingRef = useRef(null),

        // set every cycle for immediate accessibility
        orientationRef = useRef(null),
        layoutRef = useRef(null),
        cellDimensionsRef = useRef(null),
        lastGoodCellDimensionsRef = useRef(null),
        // what the validation effects last saw: StrictMode runs an effect twice at mount, and a bad value is reported once
        lastOrientationCheckRef = useRef(null),
        lastLayoutCheckRef = useRef(null),
        lastCellDimensionsCheckRef = useRef(null),
        lastSpacingPropRef = useRef(undefined),
        // the host's callbacks, with the scroller's name beside them: a report with no callback names its scroller in
        // the console (utilities.tsx). A holder of its own, since React seals the object useRef returns
        callbacksRef = useState(() => ({current: null, scrollerName: null}))[0],
        callsRef = useRef(null),
        operationsRef = useRef(null),
        viewportDimensionsRef = useRef(null),
        cradlePotentialRef = useRef(null),
        scrollerStateRef = useRef(null),

        // set by state change
        spacingRef = useRef(null),
        fetchCellsRef = useRef(fetchCells),
        fetchCeilingRef = useRef(DEFAULT_FETCH_CEILING),

        // the placeholder cells and the one fetch out at a time (useCells); a holder of its own, as callbacksRef
        placeholdersRef = useState(() => ({current: createPlaceholderState()}))[0],
        // the end state declared as one record with one writer (endMachine). The hooks tell it each event beside the
        // fields they act on, and read it through the module's readings
        { tell: tellEnd, read: readEnd, follow: followEnd } = useState(createEndMachine)[0],
        // the intersections' answer to an empty fetch at an end (useIntersections sets it, useCells calls it)
        onRunEndedRef = useRef(null),
        // the intersections' bring of a cradle the scroll has outrun, for the answer's task (useIntersections sets
        // it, useCells calls it)
        bringOutrunCradleRef = useRef(null),
        // the reset of the cradle to a seed, for a run's answer that leaves the cradle empty (useReset sets it,
        // useCells calls it)
        resetRef = useRef(null),

        // the mount-time seed; the prop is inert after mount
        seedReferenceIDRef = useRef(seedReferenceID),

        // a seed the host asked for before layout, kept for the first reset that can honour it
        heldSeedReferenceIDRef = useRef(undefined),

        // base states
        [scrollerState,setScrollerState] = useState('setup'),
        [viewportDimensions,setViewportDimensions] = useState(null),
        hasJustResizedRef = useRef(false),
        [styles, setStyles] = useState(selectStyles(orientation)),
        [scrollblockCrossSize, setScrollblockCrossSize] = useState(null),

        // scroller structure
        viewportRef = useRef(null),
        scrollblockRef = useRef(null),
        axisRef = useRef(null),
        // ...headblock
        headblockRef = useRef(null),
        leadHeadblockBandRef = useRef(null),
        leadHeadblockBandBackwardTriggerRef = useRef(null),
        headblockOverflowTriggerRef = useRef(null),
        // ...tailblock
        tailblockRef = useRef(null),
        leadTailblockBandRef = useRef(null),
        leadTailblockBandStartTriggerRef = useRef(null),
        leadTailblockBandEndTriggerRef = useRef(null),
        tailblockOverflowTriggerRef = useRef(null),

        // scroller configuration
        [cradlePotential, setCradlePotential] = useState(null), // maximal configuration
        cradleActualRef = useRef({orientation, layout, ...baseCradleActual}), // actual configuration
        axisPositionRef = useRef({x:0,y:AXIS_START_POSITION}),
        cradleMarginsRef = useRef(null),
        bandPaddingRef = useRef(null),
        cellGapRef = useRef(null),

        // cell tracking -- cells are listed in presentation order
        currentAxisReferenceIDRef = useRef(seedReferenceID),
        cellDataListRef = useRef([]), // host cell data
        portalIDListRef = useRef([]), // sync with cellPortalListRef, to find portal position
        cellPortalListRef = useRef([]), // immediate access
        portalContainerMapRef = useRef(new Map()), // id -> containerElement
        [portalRenderList,setPortalRenderList] = useState([]), // portal render
        [connectTick,setConnectTick] = useState(0), // a wanted observer reconnect is flushed after the commit
        [endIndicators, setEndIndicators] = useState(null), // what the end indicator reads at each end, with the mark each stands on and its component; null while none is shown

        // band tracking -- bands are listed in presentaton order
        headBandListRef = useRef<HTMLElement[]>([]),
        tailBandListRef = useRef<HTMLElement[]>([]),

        // scroll data
        scrollTopRef = useRef(0),
        scrollLeftRef = useRef(0),
        // scrollDirectionVerticalRef = useRef(0),
        // scrollDirectionHorizontalRef = useRef(0),
        [isScrollingMode, setIsScrollingMode] = useState(false),
        [scrollingModeEndTick, setScrollingModeEndTick] = useState(0), // see endScrollingMode
        immediateIsScrollingRef = useRef(false),
        lastScrollEventTimeRef = useRef(-Infinity),
        immediateStopScrollingRef = useRef(false),
        holdCrossOpenRef = useRef(false), // a held list has room across of its own; written as a hold opens
        canTakeEndInputRef = useRef(false), // the viewport hears a wheel and a finger's moves so that they can be cancelled
        endInputListenersRef = useRef(null), // the wheel and touchmove listeners on the viewport, and how they were put on
        scrollendSupportedRef = useRef(false), // read once at mount; see the listener there

        // observers
        intersectionObserverRef = useRef(null),
        intersectionsMapRef = useRef(new Map()), // combined state, for intersections evaluation
        resizeObserverRef = useRef(null),
        cradleMutationObserverRef = useRef(null),
        bandMutationObserverRef = useRef(null),
        cellScrollsRef = useRef(null), // what has scrolled inside each cell's frame (cellScroll.tsx); null while off

        // timeout id's
        scrollMomentumTimeoutIDRef = useRef(null),
        // the reset of the scroll position, where it moves the viewport, is reported like any scroll, by a scroll
        // event and a scrollend in the same rendering step: 'scroll' while that scroll event is owed, 'scrollend'
        // from it until the next event of either kind
        resetReportRef = useRef(null),
        restoreScrollingTimeoutIDRef = useRef(null),
        resizeTimeoutIDRef = useRef(null),
        reconcileFrameIDRef = useRef(null),

        // this scroller's own settings, read where they are used: two scrollers on one page never share them
        standardMomentumFadeRef = useRef(DEFAULT_STANDARD_SCROLL_MOMENTUM_FADE),
        shortMomentumFadeRef = useRef(DEFAULT_SHORT_MOMENTUM_FADE), // the resize debounce's
        runwayBandsRef = useRef(DEFAULT_RUNWAY_BANDS)

    // a number, so the cradlePotential effect runs on a change of runway and not on each new operations object
    const runwayBands = operations.runway ?? DEFAULT_RUNWAY_BANDS

    // a field that is not a size is replaced by its last good value here, and reported by an effect below
    const 
        cellDimensionsCheck = useMemo(()=>{

            return validateCellDimensions(hostCellDimensions, lastGoodCellDimensionsRef.current, orientation, layout)

        },[hostCellDimensions, orientation, layout]),

        cellDimensions = cellDimensionsCheck.value

    // for immediately accessibility
    orientationRef.current = orientation
    layoutRef.current = layout
    cellDimensionsRef.current = cellDimensions
    // fetchCellsRef.current set separately
    // spacingRef.current = set separately
    callbacksRef.current = callbacks
    callbacksRef.scrollerName = scrollerName
    callsRef.current = calls
    operationsRef.current = operations
    viewportDimensionsRef.current = viewportDimensions
    cradlePotentialRef.current = cradlePotential
    scrollerStateRef.current = scrollerState
    standardMomentumFadeRef.current = technical?.STANDARD_SCROLL_MOMENTUM_FADE ?? DEFAULT_STANDARD_SCROLL_MOMENTUM_FADE
    shortMomentumFadeRef.current = technical?.SHORT_MOMENTUM_FADE ?? DEFAULT_SHORT_MOMENTUM_FADE
    const fetchCeiling = technical?.FETCH_CEILING
    fetchCeilingRef.current = ((typeof fetchCeiling == 'number') && Number.isFinite(fetchCeiling) && (fetchCeiling > 0))
        ? fetchCeiling
        : DEFAULT_FETCH_CEILING
    runwayBandsRef.current = runwayBands

    // --- component utility functions

    const assertIntersectionsDisconnect = useCallback(() => {

        if (!intersectionsConnectedRef.current) return

        intersectionObserverRef.current.disconnect()

        intersectionsConnectedRef.current = false

    },[])

    const assertIntersectionsConnect = useCallback(() => {

        if (!isMountedRef.current) return

        if (DOMManipulationQueueRef.current.isBusy()) return

        intersectionsConnectWantedRef.current = false // past the gate the request is answered: connected already, or now

        if (intersectionsConnectedRef.current) return

        intersectionsMapRef.current.clear()

        headblockOverflowTriggerRef.current && intersectionObserverRef.current.observe(headblockOverflowTriggerRef.current)
        leadHeadblockBandRef.current && intersectionObserverRef.current.observe(leadHeadblockBandRef.current)
        leadHeadblockBandBackwardTriggerRef.current && intersectionObserverRef.current.observe(leadHeadblockBandBackwardTriggerRef.current)

        leadTailblockBandRef.current && intersectionObserverRef.current.observe(leadTailblockBandRef.current)
        leadTailblockBandStartTriggerRef.current && intersectionObserverRef.current.observe(leadTailblockBandStartTriggerRef.current)
        leadTailblockBandEndTriggerRef.current && intersectionObserverRef.current.observe(leadTailblockBandEndTriggerRef.current)
        tailblockOverflowTriggerRef.current && intersectionObserverRef.current.observe(tailblockOverflowTriggerRef.current)

        intersectionsConnectedRef.current = true

    },[])

    // asked for inside a queued task the connect is refused (the queue is busy with that task), so the request is
    // held; the queue ticks the layout effect below when it drains (its onIdle), after the commit of the state
    // the task changed. The request itself never ticks: a tick raised in a discrete event's lane flushed before
    // the task had finished, was refused again, and nothing re-ticked
    const requestIntersectionsConnect = useCallback(() => {

        intersectionsConnectWantedRef.current = true

        assertIntersectionsConnect()

    },[])

    // The observers are asked to report the layout as it stands. What they reported before is dropped, and what they
    // had still to deliver with it (a disconnect is not specified to empty an observer's queue; takeRecords is), so
    // that the next evaluation reads every trigger as it is now. Asked while the queue is at work, the report comes
    // as the queue drains, of the layout it leaves
    const requestIntersectionsReport = useCallback(() => {

        if (!isMountedRef.current) return

        assertIntersectionsDisconnect()

        intersectionObserverRef.current.takeRecords()

        intersectionsMapRef.current.clear()

        requestIntersectionsConnect()

    },[])

    useLayoutEffect(()=>{

        if (intersectionsConnectWantedRef.current) assertIntersectionsConnect()

    },[connectTick])

    const setAxisPosition = useCallback((x,y, source = 'general') =>{

        const 
            xpx = x + 'px',
            ypx = y + 'px',
            translate = `translate(${xpx},${ypx})`

        axisPositionRef.current = {x,y}
        axisRef.current.style.transform = translate

    },[])

    // The end state's slide (useIntersections, slideToEndMark). The transform is the axis's position, for everything
    // that reads it. The slide is only what is drawn: the axis's translate, which the browser adds to the transform,
    // run from an offset back to nothing, so the content is seen to travel to where the axis already has it
    const slideAxis = (x, y, timing) => axisRef.current.animate({translate: [`${x}px ${y}px`, '0px 0px']}, timing)

    // what is left of a slide at this moment, as the browser draws it; nothing when none runs
    const readAxisSlide = () => {

        const [x, y] = getComputedStyle(axisRef.current).translate.split(' ').map(parseFloat)

        return {x:x || 0, y:y || 0}

    }

    const updateCurrentAxisReferenceID = useCallback(() => {

        // an empty tail has no row at the axis (at(-0) would name the cradle's first), and the fill that follows
        // names the row it stands there: the reference stands until then
        if (!cradleActualRef.current.forwardCells) return

        const
            currentAxisReferenceID = portalIDListRef.current.at(-cradleActualRef.current.forwardCells)

        if (currentAxisReferenceID !== currentAxisReferenceIDRef.current) {

            currentAxisReferenceIDRef.current = currentAxisReferenceID

            if (callbacksRef.current.axisReferenceID) {

                // an axis on a placeholder names the row the placeholder stands beside, and which side of it
                const entry = placeholdersRef.current.map.get(currentAxisReferenceID)

                entry
                    ? callbacksRef.current.axisReferenceID(currentAxisReferenceID,
                        {isPlaceholder: true, referenceID: entry.referenceID, direction: entry.direction})
                    : callbacksRef.current.axisReferenceID(currentAxisReferenceID)

            }

        }
    },[])

    const trimCradle = useCallback(() => {

        const
            cradleActual = cradleActualRef.current,
            cradlePotential = cradlePotentialRef.current,
            tailBandList = tailBandListRef.current

        let tailCellOffset = 0

        if (tailBandList.length > 1) {
            tailCellOffset = (cradleActual.cellsPerBand - tailBandList[0].childElementCount)
        }

        // what the trim may take while a placeholder run stands is the reading every cut takes (cutLimits): never
        // the real row a run is anchored on, and nothing behind an axis standing inside a run
        const
            {forwardCut, backwardCut, forwardAnchor, axisIndex, axisInForwardRun} = cutLimits()

        // the trim behind the axis also keeps the rows a put-back would stand on. A viewport whose forward edge stands
        // past the real rows ahead of the axis (a crossing on a full cradle, an outrun) is a bet that rows are coming;
        // an empty answer brings it back so that the last row ends at its forward edge, and what it then shows behind
        // the axis is the span it is short by, so the bands covering that span stay. Bounded by the viewport's own
        // span. At the head the put-back rests the viewport on the axis, which the tail's potential already covers
        const putBackKeep = () => {

            const viewport = viewportRef.current

            if (!viewport || axisInForwardRun) return 0

            const
                isH = orientationRef.current === 'horizontal',
                size = (band) => isH ? band.offsetWidth : band.offsetHeight,
                vpDim = isH ? viewport.clientWidth : viewport.clientHeight,
                lastRealIndex = (forwardAnchor == -1) ? (portalIDListRef.current.length - 1) : forwardAnchor,
                headBandList = headBandListRef.current

            let realAhead = lastRealIndex - axisIndex + 1, span = 0

            for (const band of tailBandList) {
                if (realAhead <= 0) break
                span += size(band)
                realAhead -= band.childElementCount
            }

            const shortfall = vpDim - span

            if (!(shortfall > 0)) return 0

            let kept = 0, covered = 0

            for (let index = headBandList.length - 1; index >= 0; index--) {
                if (!(covered < shortfall)) break
                covered += size(headBandList[index])
                kept += headBandList[index].childElementCount
            }

            return kept

        }

        const
            forwardCellsToRemoveCount = Math.min(
                Math.max(cradleActual.forwardCells - (cradlePotential.forwardCells - tailCellOffset),0),
                forwardCut),
            backwardCellsToRemoveCount = Math.min(
                Math.max(cradleActual.backwardCells - cradlePotential.backwardCells - putBackKeep(),0),
                backwardCut)

        removeCells({
            forwardCellsToRemoveCount,
            backwardCellsToRemoveCount,
        })

    },[])

    const fillCradle = useCallback(async () => { // name to avoid collision with user call 'fillCradle'

        await getCells('after') // returns promise

        return true

    },[])

    const getSeed = useCallback(async (referenceID) => {

        if (!isValidID(referenceID)) {
            reportError(callbacksRef, 'getSeed', 'must be a valid referenceID', [referenceID])
            return false
        }

        await getCells('at', referenceID)

        return true

    },[])

    // The record of the scroll position (scrollTopRef, scrollLeftRef) is what the viewport reported when the scroller
    // last heard it scroll or last put it somewhere. A viewport found anywhere else has been scrolled since, and the
    // scroll event that reports it is still to come
    const isScrollUnheard = useCallback(() => {

        const viewport = viewportRef.current

        return !!viewport && ((viewport.scrollTop !== scrollTopRef.current) || (viewport.scrollLeft !== scrollLeftRef.current))

    },[])

    const resetAxisPosition = useCallback((freshReset = false) => {

        if (!viewportRef.current) return // error condition

        const { scrollTop, scrollLeft } = viewportRef.current

        if (orientationRef.current == 'vertical') {

            // freshReset: use offset of 1 to place axis 1px inside the viewport, preventing the
            // intersection observer from seeing the forward trigger as 'before' at the exact boundary.
            const axisOffset = freshReset ? 1 : (axisPositionRef.current.y - scrollTop)

            viewportRef.current.scrollTo(freshReset ? 0 : scrollLeft, AXIS_START_POSITION)
            setAxisPosition(0, AXIS_START_POSITION + axisOffset, 'stop scrolling')

        } else { // 'horizontal'

            const axisOffset = freshReset ? 1 : (axisPositionRef.current.x - scrollLeft)

            viewportRef.current.scrollTo(AXIS_START_POSITION, freshReset ? 0 : scrollTop)
            setAxisPosition(AXIS_START_POSITION + axisOffset, 0)

        }

        // a browser may round a position it is given, so the record is what the viewport reports once it is put
        // there; where that is what it reported before, the reset moved nothing and no scroll event will report it
        scrollTopRef.current = viewportRef.current.scrollTop
        scrollLeftRef.current = viewportRef.current.scrollLeft

        if ((scrollTopRef.current !== scrollTop) || (scrollLeftRef.current !== scrollLeft)) resetReportRef.current = 'scroll'

    },[])

    // ===================[ breakout code to use* modules ]======================

    const 
        {getCells, withdrawPlaceholders, abortFetches, clearPlaceholders, isFetchOpenAt, isEndFixed, isCellScrollRestored, markQuiet, isQuietAt, quietMarkStandsAt, quietReasonAt, clearQuietMarks, clearQuietAt, isEndAskAt, endIndicatorComponentType, cutLimits, openingStands, rebuildPlaceholderPortals, placeholderReport} = useCells({

            scrollerName,

            DOMManipulationQueueRef,

            viewportRef,

            orientationRef,
            layoutRef,
            spacingRef,

            cradlePotentialRef,
            cradleActualRef,

            cellPortalListRef,
            portalIDListRef,
            cellDataListRef,
            portalContainerMapRef,

            cellDimensionsRef,

            tailblockRef,
            tailBandListRef,
            leadTailblockBandRef,
            headblockRef,
            headBandListRef,
            leadHeadblockBandRef,

            setPortalRenderList,
            fetchCellsRef,
            operationsRef,
            fetchCeilingRef,
            placeholdersRef,
            onRunEndedRef,
            tellEnd,
            readEnd,
            bringOutrunCradleRef,
            resetRef,
            updateCurrentAxisReferenceID,
            currentAxisReferenceIDRef,
            callbacksRef,
            bandMutationObserverRef,
            requestIntersectionsConnect,
            trimCradle,

        }),

        removeCells = useRemoveCells({
        
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
            tellEnd,

            callbacksRef,

        }),

        {
            evaluateIntersections, followViewport, bringOutrunCradle, onEndScroll, onEndScrollingModeEnd, onEndWheel,
            onEndTouchStart, onEndTouchMove, isBringingBack, endStateReport, readEndsAfterResize,
        } = useIntersections({

            scrollerName,

            DOMManipulationQueueRef,

            orientationRef,

            intersectionsMapRef,
            immediateIsScrollingRef,
            lastScrollEventTimeRef,
            viewportRef,
            immediateStopScrollingRef,
            holdCrossOpenRef,
            canTakeEndInputRef,
            tellEnd,
            readEnd,
            followEnd,
            scrollTopRef,
            scrollLeftRef,
            restoreScrollingTimeoutIDRef,
            standardMomentumFadeRef,
            shortMomentumFadeRef,
            layoutRef,
            AXIS_START_POSITION,
            axisPositionRef,
            cradleActualRef,
            tailblockOverflowTriggerRef,
            cradlePotentialRef,
            headblockRef,
            headBandListRef,
            tailblockRef,
            tailBandListRef,
            leadHeadblockBandRef,
            headblockOverflowTriggerRef,
            leadTailblockBandRef,

            portalIDListRef,

            callbacksRef,
            setAxisPosition,
            slideAxis,
            readAxisSlide,
            assertIntersectionsDisconnect,
            requestIntersectionsConnect,
            requestIntersectionsReport,

            trimCradle,
            fillCradle,
            updateCurrentAxisReferenceID,
            isFetchOpenAt,
            isEndFixed,
            markQuiet,
            isQuietAt,
            quietMarkStandsAt,
            quietReasonAt,
            clearQuietAt,
            isEndAskAt,
            onRunEndedRef,
            bringOutrunCradleRef,
            setEndIndicators:(shown, marks) => setEndIndicators((shown.head || shown.tail) ? {...shown, marks, Component:endIndicatorComponentType()} : null),

        }),

        reset = useReset({

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
            requestIntersectionsConnect,
            getSeed,
            callbacksRef,
            heldSeedReferenceIDRef,
            currentAxisReferenceIDRef,
            resetAxisPosition,
            clearPlaceholders,
            resetRef,

        }),

        applyNewCradlePotential = useNewCradlePotential({

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
            requestIntersectionsConnect,
            setPortalRenderList,
            removeCells,
            cutLimits,
            trimCradle,
            getSeed,
            followViewport,
            readEndsAfterResize,
            updateCurrentAxisReferenceID,
            bandMutationObserverRef,

        }),


        availableCalls = useCalls({

            runwayBandsRef,

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
            followViewport,
            bringOutrunCradle,
            reset,
            callbacksRef,
            assertIntersectionsDisconnect,
            requestIntersectionsConnect,
            bandMutationObserverRef,
            cellScrollsRef,
            placeholdersRef,
            withdrawPlaceholders,
            openingStands,
            clearQuietMarks,
            placeholderReport,
            endStateReport,
        })

    // the host's placeholder component or context changed identity: the standing placeholders are drawn again
    useEffect(() => {

        rebuildPlaceholderPortals()

    }, [operations?.placeholder, operations?.placeholderContext])

    // ==============================[ initialization effects ]========================

    useEffect(()=>{

        // report initial axisReferencerID (seedReferencerID)
        callbacksRef.current.axisReferenceID && callbacksRef.current.axisReferenceID(currentAxisReferenceIDRef.current)

    },[])

    // a value something stands in for is a substitution the scroller goes on with, so the host is warned; one
    // nothing stands in for leaves the list unable to lay out, and that is an error
    const reportProblems = (source, problems) => {

        problems.forEach(({property, value, used, message}) => {

            const report = (used == null) ? reportError : reportWarning

            report(callbacksRef, source, `${property} ${message}`, [value], {property, used})

        })

    }

    useLayoutEffect(()=>{

        if (lastOrientationCheckRef.current === orientationCheck) return
        lastOrientationCheckRef.current = orientationCheck

        reportProblems('orientation', orientationCheck.problems)

        lastGoodOrientationRef.current = orientationCheck.value

    },[orientationCheck])

    useLayoutEffect(()=>{

        if (lastLayoutCheckRef.current === layoutCheck) return
        lastLayoutCheckRef.current = layoutCheck

        reportProblems('layout', layoutCheck.problems)

        lastGoodLayoutRef.current = layoutCheck.value

    },[layoutCheck])

    useLayoutEffect(()=>{

        if (lastCellDimensionsCheckRef.current === cellDimensionsCheck) return
        lastCellDimensionsCheckRef.current = cellDimensionsCheck

        reportProblems('cellDimensions', cellDimensionsCheck.problems)

        if (lastGoodCellDimensionsRef.current === null) previousCellDimensionsRef.current = cellDimensionsCheck.value
        lastGoodCellDimensionsRef.current = cellDimensionsCheck.value

    },[cellDimensionsCheck])

    // set spacing values
    // a layout effect, declared ahead of the one that reads the spacing refs, so a change lands in the same commit
    useLayoutEffect(()=>{

        if (lastSpacingPropRef.current === spacing) return
        lastSpacingPropRef.current = spacing

        const {value, problems} = validateSpacing(spacing, spacingRef.current ?? DEFAULT_SPACING)

        reportProblems('spacing', problems)

        // a change that leaves every value as it was changes nothing downstream
        if (spacingRef.current && (JSON.stringify(value) == JSON.stringify(spacingRef.current))) return

        cradleMarginsRef.current = value.cradleMargin
        bandPaddingRef.current = value.bandPadding
        cellGapRef.current = value.cellGap
        if (spacingRef.current === null) previousSpacingRef.current = value
        spacingRef.current = value

    },[spacing])

    // set up IntersectionObserver, ResizeObserver and MutationObserver
    useEffect(()=>{

        isMountedRef.current = true

        // React nulls viewportRef in the commit, before this cleanup runs, so the cleanup removes from what it added to
        const viewport = viewportRef.current
        const queue = DOMManipulationQueueRef.current
        queue.start()

        const iObserver = intersectionObserverRef.current =
            new IntersectionObserver(intersectionObserverCallback,{
                root:viewportRef.current,
            })

        const rObserver = resizeObserverRef.current =
            new ResizeObserver(resizeObserverCallback)

        rObserver.observe(viewportRef.current)

        // allow ancestor components to trigger scroll-position restoration via DOM event
        // the restore's promise is discarded here, so a failure inside it is reported
        const handleRs3Restore = () => {
            availableCalls.restoreScrollPositions().catch((error) => {
                reportError(callbacksRef, 'restoreScrollPositions', errorMessage(error), [])
            })
        }
        viewport.addEventListener('rs3restore', handleRs3Restore)

        // Chrome 114, Firefox 109 and Safari 26 send scrollend once a scroll has settled, so scrolling mode ends
        // there, well inside the momentum fade; a browser without it is served by the fade timer alone. The read
        // and this branch can go, the listener kept unconditionally, once every supported browser sends it
        scrollendSupportedRef.current = typeof window !== 'undefined' && 'onscrollend' in window
        if (scrollendSupportedRef.current) viewport.addEventListener('scrollend', onViewportScrollEnd, { passive: true })

        // The end state hears the user's input: its bring-back stops for it, and a pull that starts at a fixed
        // end's mark is the scroller's to draw. Native listeners: the cells are portals rendered beside the
        // viewport, and their React events do not pass through it. A touch's start is never cancelled, so it is
        // heard passively, for the scroller's life; the wheel and a finger's moves are the next effect's. The
        // handlers read the hook's refs alone, so the closures of the render that put them on serve until they
        // are taken off
        viewport.addEventListener('touchstart', onEndTouchStart, { passive: true })

        return () => {
            isMountedRef.current = false
            cancelAnimationFrame(reconcileFrameIDRef.current)
            clearTimeout(scrollMomentumTimeoutIDRef.current)
            clearTimeout(restoreScrollingTimeoutIDRef.current)
            clearTimeout(resizeTimeoutIDRef.current)
            intersectionObserverRef.current.disconnect()
            intersectionsConnectedRef.current = false
            resizeObserverRef.current.disconnect()
            viewport.removeEventListener('rs3restore', handleRs3Restore)
            viewport.removeEventListener('scrollend', onViewportScrollEnd)
            viewport.removeEventListener('touchstart', onEndTouchStart)
            viewport.removeEventListener('wheel', endInputListenersRef.current?.onEndWheel)
            viewport.removeEventListener('touchmove', endInputListenersRef.current?.onEndTouchMove)
            endInputListenersRef.current = null
            abortFetches()
            queue.stop(false)
        }

    },[])

    // A wheel and a finger's move can be cancelled only by a listener that is not passive, and the browser waits
    // for such a listener before it scrolls. The one input the scroller cancels is a pull at a fixed end's mark, so
    // the two are heard that way only by a list that operations.fixedEnds gives a fixed end, and passively by every
    // other list. The choice follows the option and not the end state: whether a touch's moves can be cancelled is
    // settled as the touch starts, before the list is known to reach a fixed end under it. The option is read after
    // every render, and not in one, since a value that cannot be used is reported to the host as it is read; the
    // listeners are changed only where the reading has, and the mount's cleanup takes off what stands. The option
    // is read each time it is used and the listeners follow it at a render, so the take is told how the viewport
    // hears (canTakeEndInputRef) and cancels nothing it hears passively
    useEffect(()=>{

        const
            viewport = viewportRef.current,
            heard = endInputListenersRef.current,
            takesEndInput = isEndFixed('head') || isEndFixed('tail')

        if (heard?.takesEndInput === takesEndInput) return

        if (heard) {
            viewport.removeEventListener('wheel', heard.onEndWheel)
            viewport.removeEventListener('touchmove', heard.onEndTouchMove)
        }

        const options = { passive: !takesEndInput }

        viewport.addEventListener('wheel', onEndWheel, options)
        viewport.addEventListener('touchmove', onEndTouchMove, options)
        endInputListenersRef.current = { takesEndInput, onEndWheel, onEndTouchMove }
        canTakeEndInputRef.current = takesEndInput

    })

    // cradle position initialization
    useEffect(()=>{
        if (orientationRef.current == 'vertical') {

            viewportRef.current.scrollTo(scrollLeftRef.current,AXIS_START_POSITION)
            setAxisPosition(0,AXIS_START_POSITION - 1, 'setup')

        } else { // 'horizontal'

            viewportRef.current.scrollTo(AXIS_START_POSITION,scrollTopRef.current)
            setAxisPosition(AXIS_START_POSITION - 1,0)

        }
    },[])

    // return calls to host
    useEffect(()=> {

        if (!calls) return

        // a call made after unmount does nothing, answers with the empty value of its kind, and the host hears once
        const guarded = {}
        for (const name of Object.keys(availableCalls)) {
            const call = availableCalls[name]
            guarded[name] = (...args) => {
                if (isMountedRef.current) return call(...args)
                if (!unmountedCallWarnedRef.current) {
                    unmountedCallWarnedRef.current = true
                    reportWarning(callbacksRef, name, 'called after the scroller was unmounted; nothing was done', args)
                }
                return (name in UNMOUNTED_ANSWERS) ? UNMOUNTED_ANSWERS[name] : false
            }
        }
        Object.assign(calls, guarded)

    },[calls])

    // ===========================[ callbacks ]=========================

    // An IntersectionObserver reports only changes of intersection, so a trigger that crosses the
    // whole viewport between two rendering updates (a fast fling) is never reported and keeps its
    // old side. That blocks the all-before/all-after recovery and strands the cradle out of view.
    // Correct only that case, from live geometry: an entry not in the current batch, not 'in', and
    // now wholly beyond the opposite edge. Anything touching the viewport is left to the observer
    const reconcileUnreportedCrossings = useCallback((viewportBounds, freshTypes = null) => {

        let changed = false

        intersectionsMapRef.current.forEach((record, type) => {

            if (freshTypes?.has(type) || record.rs3position == 'in') return

            const rect = record.target.getBoundingClientRect()

            const position = (orientationRef.current == 'vertical')
                ? (rect.bottom < viewportBounds.top ? 'before' : rect.top > viewportBounds.bottom ? 'after' : null)
                : (rect.right < viewportBounds.left ? 'before' : rect.left > viewportBounds.right ? 'after' : null)

            if (!position || position == record.rs3position) return

            intersectionsMapRef.current.set(type, {
                target: record.target,
                boundingClientRect: rect,
                rs3rootBounds: viewportBounds,
                rs3position: position,
            })
            changed = true

        })

        return changed

    },[])

    const intersectionObserverCallback = useCallback((entries, observer)=> {

        // React nulls the refs in the commit that removes the scroller and disconnects this observer in the
        // effect cleanup after it, which a slow commit pushes into a later task: a notice queued before the commit
        // is delivered in between, with no scroller to read. isMountedRef cannot tell, as it turns false only in
        // that cleanup (and stays true while a Suspense boundary hides the list, which also nulls the refs)
        if (!viewportRef.current) return

        entries.sort((a,b)=>{
            return a.time - b.time // ascending
        })

        // Safari multiplies rootBounds by the page zoom when the root is an element (0.75x at 75%)
        // while boundingClientRect stays in CSS px, so the two disagree; a direct reading of the
        // viewport keeps both in CSS px. Consumers read rs3rootBounds, never rootBounds — WebKit bug 325821
        const viewportBounds = viewportRef.current.getBoundingClientRect()
        const freshTypes = new Set()

        entries.forEach((entry)=>{
            entry.rs3rootBounds = viewportBounds
            if (orientationRef.current == 'vertical') {
                entry.rs3position =
                    entry.isIntersecting
                        ?'in'
                        :viewportBounds.top > entry.boundingClientRect.bottom
                            ?'before'
                            :'after'
            } else { // 'horizontal'
                entry.rs3position =
                    entry.isIntersecting
                        ?'in'
                        :viewportBounds.left > entry.boundingClientRect.right
                            ?'before'
                            :'after'
            }
            intersectionsMapRef.current.set(entry.target.dataset.type, entry)
            freshTypes.add(entry.target.dataset.type)
        })

        reconcileUnreportedCrossings(viewportBounds, freshTypes)

        evaluateIntersections('observer')

    },[])

    const resizeObserverCallback = useCallback((entries) => {

        const
            viewportEntry = entries[0],
            borderBox = viewportEntry.borderBoxSize[0],
            width = borderBox.inlineSize,
            height = borderBox.blockSize

        if (width === 0 || height === 0) return // skip transient zero-dimension state

        assertIntersectionsDisconnect()

        const timeout = shortMomentumFadeRef.current

        clearTimeout(resizeTimeoutIDRef.current)
        resizeTimeoutIDRef.current = setTimeout(()=>{

            if (scrollerStateRef.current == 'setup') {
                setScrollerState('ready') // measurements available
            }

            hasJustResizedRef.current = true
            setViewportDimensions({width,height})

        }, timeout)

    },[])

    // ======================[ events ]============================

    // the end of scrolling mode: the browser's scrollend or the momentum fade timer, whichever comes first.
    // A second call is a no-op, and the timer is cleared so that neither end repeats the other
    const endScrollingMode = useCallback(() => {

        clearTimeout(scrollMomentumTimeoutIDRef.current)
        scrollMomentumTimeoutIDRef.current = null

        if (!immediateIsScrollingRef.current) return

        // the scroll handler's entry (a continuous-priority update) and a scrollend listener's end (a default one)
        // render in one batch when the browser sends both in one rendering step, as it does for an instant scroll,
        // and a mode that enters and ends in one commit changes no state: the tick makes the end effect run anyway
        setIsScrollingMode(false)
        setScrollingModeEndTick(tick => tick + 1)

    },[])

    // under the pin (a hold at an end of the data, a position recovery) every scroll event is answered by a
    // scrollTo, and each of those sends a scrollend of its own: the fade timer ends the mode once the pin is released
    const onViewportScrollEnd = useCallback(() => {

        // the scrollend that comes with the reset's own scroll event ends the reset, not a bring-back begun since:
        // ending the mode on it would reset the position under that bring-back and stop it, and its own scrollend
        // ends the mode
        const ownReset = (resetReportRef.current == 'scrollend')

        if (ownReset) resetReportRef.current = null

        if (immediateStopScrollingRef.current) return

        if (ownReset && isBringingBack()) return

        endScrollingMode()

    },[])

    // TODO reverse scroll direction should cancel immediateStopScrolling
    const onViewportScroll = (event) => {

        const { target } = event

        const ownReset = (resetReportRef.current == 'scroll')

        resetReportRef.current = ownReset ? 'scrollend' : null

        clearTimeout(scrollMomentumTimeoutIDRef.current)
        if (immediateStopScrollingRef.current) {

            // where the list has room across of its own, the cross axis stays the gesture's and the record follows it
            if (!holdCrossOpenRef.current) {

                target.scrollTo(scrollLeftRef.current, scrollTopRef.current)

            } else if (orientationRef.current == 'vertical') {

                scrollLeftRef.current = target.scrollLeft
                target.scrollTop = scrollTopRef.current

            } else {

                scrollTopRef.current = target.scrollTop
                target.scrollLeft = scrollLeftRef.current

            }

        } else {

            const unheard = isScrollUnheard()

            scrollTopRef.current = target.scrollTop
            scrollLeftRef.current = target.scrollLeft

            // the first scroll event after the scroller's own reset reports that reset. Where it reports nothing
            // more, the viewport is where the scroller put it and has not moved over the content: no gesture is read
            // from it, or a list held past an end would ask its host again for a reset
            const resetAlone = ownReset && !unheard

            if (!resetAlone) onEndScroll()

        }

        // scroll end arrives only after the momentum tail and its fade (seconds on a long fling), so
        // a cradle stranded mid-fling would sit blank until then; check once a frame while scrolling
        if (!reconcileFrameIDRef.current) {
            reconcileFrameIDRef.current = requestAnimationFrame(()=>{

                reconcileFrameIDRef.current = null

                if (viewportRef.current && intersectionsConnectedRef.current &&
                    reconcileUnreportedCrossings(viewportRef.current.getBoundingClientRect())) {

                    evaluateIntersections('scroll')

                }

            })
        }

        lastScrollEventTimeRef.current = performance.now()
        if (!isScrollingMode) {
            immediateIsScrollingRef.current = true
            setIsScrollingMode(true)
        }
        scrollMomentumTimeoutIDRef.current = setTimeout(()=>{
            endScrollingMode()
        },standardMomentumFadeRef.current)
    }

    // =========================[ reconfiguration effects ]=====================

    // A cell's frame is moved whenever its cell crosses the axis, and a browser drops the scroll offsets of
    // everything under a moved element. One pair of observers sees each frame land: the scroller first puts back
    // what had scrolled inside it (operations.restoreCellScroll), then tells the host, if it asked
    // (operations.dispatchAttachedEvents), so the host's listener finds the scroll already back.
    // What has scrolled is heard by one listener. It reads and writes nothing of the list's own scrolling: the
    // viewport's own scroll is left at once (recordCellScroll), and the scroll of a cell's content never reaches
    // onViewportScroll, since scroll does not bubble
    useEffect(()=>{

        const
            dispatchAttachedEvents = !!operations.dispatchAttachedEvents,
            isRestored = isCellScrollRestored()

        if (!isRestored) cellScrollsRef.current = null
        else if (!cellScrollsRef.current) cellScrollsRef.current = createCellScrollState()

        if (!isRestored && !dispatchAttachedEvents) return

        // React nulls viewportRef in the commit, before this cleanup runs, so the cleanup removes from what it added to
        const
            viewport = viewportRef.current,
            cellScrolls = cellScrollsRef.current,
            event = new Event('rs3attached'),
            onCellScroll = (scrollEvent) => {
                recordCellScroll(cellScrolls, viewport, scrollEvent.target)
            },
            landed = (container) => {
                cellScrolls && restoreCellScroll(cellScrolls, container)
                dispatchAttachedEvents && container.firstChild && container.firstChild.dispatchEvent(event)
            },
            cradleCallback = (mutationList) => {
                mutationList.forEach((mutationRecord) => {
                    mutationRecord.addedNodes.forEach((band) => {
                        for (let index = 0; index < band.children.length; index++) {
                            landed(band.children[index])
                        }
                    })
                })
            },
            bandCallback = (mutationList) => {
                mutationList.forEach((mutationRecord) => {
                    mutationRecord.addedNodes.forEach((container) => {
                        landed(container)
                    })
                })
            },
            cradleMutationObserver = cradleMutationObserverRef.current = new MutationObserver(cradleCallback),
            bandMutationObserver = bandMutationObserverRef.current = new MutationObserver(bandCallback)

        cellScrolls && viewport.addEventListener('scroll', onCellScroll, { capture: true, passive: true })

        cradleMutationObserver.observe(headblockRef.current, {childList:true})
        cradleMutationObserver.observe(leadHeadblockBandRef.current, {childList:true})
        cradleMutationObserver.observe(tailblockRef.current, {childList:true})
        cradleMutationObserver.observe(leadTailblockBandRef.current, {childList:true})

        headBandListRef.current.forEach((band) => {
            bandMutationObserver.observe(band, {childList:true})
        })

        tailBandListRef.current.forEach((band) => {
            bandMutationObserver.observe(band, {childList:true})
        })

        return () => {
            viewport.removeEventListener('scroll', onCellScroll, { capture: true })
            cradleMutationObserver.disconnect()
            bandMutationObserver.disconnect()
            // a band made while neither is wanted must find no observer: observe() starts a disconnected one again
            cradleMutationObserverRef.current = null
            bandMutationObserverRef.current = null
        }

    },[operations.dispatchAttachedEvents, operations.restoreCellScroll])

    useLayoutEffect(() => {
        const observer = observeCradleAlignment({
            blocks: [headblockRef.current, leadHeadblockBandRef.current, tailblockRef.current, leadTailblockBandRef.current],
            readCradle: () => ({
                headBandList: headBandListRef.current,
                tailBandList: tailBandListRef.current,
                cellsPerBand: cradleActualRef.current.cellsPerBand,
                orientation: orientationRef.current,
            }),
        })
        return () => observer.disconnect()
    },[])

    // configure cradlePotential on change of cellDimensions, viewportDimensions, orientation, layout or runway
    useLayoutEffect(()=>{
        if (!viewportDimensions) return // setup

        const 
            [cradleMarginStart, cradleMarginEnd] = cradleMarginsRef.current,
            cellGap = cellGapRef.current

        let cellsPerBand, visibleBands

        const
            cellMaxWidth = cellDimensions.maxWidth,
            cellMaxHeight = cellDimensions.maxHeight,
            cellMinWidth = cellDimensions.minWidth,
            cellMinHeight = cellDimensions.minHeight,
            // spacing = spacingRef.current,
            [start, end] = spacingRef.current.bandPadding,
            bandPadding = start + end

        if (orientation == 'vertical') {

            cellsPerBand = Math.max(1, Math.floor((viewportDimensions.width - (cradleMarginStart + cradleMarginEnd) + cellGap)/(cellMinWidth + cellGap)))

            if (layout == 'uniform') {

                visibleBands = Math.ceil(viewportDimensions.height/(cellMaxHeight + bandPadding))

            } else { // 'variable'

                visibleBands = Math.ceil(viewportDimensions.height/(cellMinHeight + bandPadding))

            }

        } else { // 'horizontal'

            cellsPerBand = Math.max(1, Math.floor((viewportDimensions.height - (cradleMarginStart + cradleMarginEnd) + cellGap)/(cellMinHeight + cellGap)))

            if (layout == 'uniform') {

                visibleBands = Math.ceil(viewportDimensions.width/(cellMaxWidth + bandPadding))

            } else { // 'variable'

                visibleBands = Math.ceil(viewportDimensions.width/(cellMinWidth + bandPadding))

            }

        }

        // skip a transient state (the next ResizeObserver reading will supply valid dimensions), or a cell
        // dimension with no good value yet
        if (!(cellsPerBand > 0) || Number.isNaN(visibleBands)) return

        const
            totalBands = visibleBands + (runwayBands * 2),
            backwardBands = runwayBands,
            forwardBands = totalBands - backwardBands,
            forwardCells = forwardBands * cellsPerBand,
            backwardCells = backwardBands * cellsPerBand,
            totalCells = forwardCells + backwardCells

        const cradlePotential = {
            orientation,
            layout,
            cellsPerBand,
            visibleBands,
            totalBands,
            forwardBands,
            backwardBands,
            forwardCells,
            backwardCells,
            totalCells,
            runway:runwayBands,
        }

        if (cradleActualRef.current.cellsPerBand === null) {
            cradleActualRef.current.cellsPerBand = cellsPerBand
        }

        // scrollblock cross-axis sizing — symmetric for both orientations:
        // expand only when minimum-size cells (cellsPerBand × cellMin + gaps + margins)
        // overflow the viewport cross-axis; otherwise leave at 100% so 1fr fills naturally.
        if (orientation == 'horizontal') {
            const crossAxisNeeded = cellsPerBand * cellMinHeight + Math.max(0, cellsPerBand - 1) * cellGap + cradleMarginStart + cradleMarginEnd
            const crossAxisSize = Math.max(viewportDimensions.height, crossAxisNeeded)
            setScrollblockCrossSize(crossAxisSize > viewportDimensions.height ? crossAxisSize + 'px' : null)
        } else {
            const crossAxisNeeded = cellsPerBand * cellMinWidth + Math.max(0, cellsPerBand - 1) * cellGap + cradleMarginStart + cradleMarginEnd
            const crossAxisSize = Math.max(viewportDimensions.width, crossAxisNeeded)
            setScrollblockCrossSize(crossAxisSize > viewportDimensions.width ? crossAxisSize + 'px' : null)
        }

        setStyles(selectStyles(orientation))
        setCradlePotential(cradlePotential)
        if (hasJustResizedRef.current) {
            hasJustResizedRef.current = false
            if (callbacksRef.current.resized) {
                callbacksRef.current.resized(
                {
                    cellDimensions:{...cellDimensionsRef.current},
                    spacing:{...spacingRef.current},
                    viewportDimensions: {...viewportDimensionsRef.current},
                    ...cradlePotential
                })
            }
        }

    },[orientation, layout, cellDimensions, spacing, viewportDimensions, runwayBands])

    // reconfigure cradle on change of cradlePotential
    useLayoutEffect(()=>{

        if (!cradlePotential) return // setup

        const isReconfigured = 
            previousOrientationRef.current !== orientationRef.current ||
            previousLayoutRef.current !== layoutRef.current ||
            previousCellDimensionsRef.current !== cellDimensionsRef.current ||
            previousSpacingRef.current !== spacingRef.current

        if (isReconfigured) {

            previousOrientationRef.current = orientationRef.current
            previousLayoutRef.current = layoutRef.current
            previousCellDimensionsRef.current = cellDimensionsRef.current
            previousSpacingRef.current = spacingRef.current

        }

        DOMManipulationQueueRef.current.enqueue(async () => {

            try {

                const heldSeedReferenceID = heldSeedReferenceIDRef.current

                if (heldSeedReferenceID !== undefined) {

                    // asked for by the host before layout: it takes the mount-time seed's place
                    heldSeedReferenceIDRef.current = undefined
                    seedReferenceIDRef.current = null
                    await reset(heldSeedReferenceID)

                } else if (isReconfigured) {

                    await reset(currentAxisReferenceIDRef.current)

                } else {

                    await applyNewCradlePotential(cradlePotential)

                }

            } finally {

                requestIntersectionsConnect()

            }

        }).catch((error) => {

            viewportRef.current && reportError(callbacksRef, 'cradlePotential', errorMessage(error), [])

        })

    },[cradlePotential])

    // the latest fetchCells, read by getCells at each call; a new identity does not reset
    useLayoutEffect(()=>{

        fetchCellsRef.current = fetchCells

    },[fetchCells])

    // ==============================[ scrolling adjustments ]===============================

    useLayoutEffect(()=>{

        if (scrollerStateRef.current == 'setup') {

            // a scroll the setup made is not the user's: the mode it began ends here with nothing to read, and the
            // flag it raised is lowered, or the first scroll after the mount would be read as input still arriving
            if (!isScrollingMode) immediateIsScrollingRef.current = false

            return

        }

        if (!isScrollingMode) {

            // read before the reset takes the viewport's position for the record
            const scrollUnheard = isScrollUnheard()
            resetAxisPosition()
            onEndScrollingModeEnd(scrollUnheard)
            // reset scrolling control
            immediateIsScrollingRef.current = false

            // a crossing that happened after the last observer callback has no callback left to
            // catch it, and a stranded cradle produces none
            if (intersectionsConnectedRef.current &&
                reconcileUnreportedCrossings(viewportRef.current.getBoundingClientRect())) {

                evaluateIntersections('scroll end')

            }

        }
    },[isScrollingMode, scrollingModeEndTick])

    // =============================[ render ]=======================

    const scrollblockStyle = scrollblockCrossSize
        ? {...styles.scrollblockStyles, ...(orientation === 'horizontal' ? {height: scrollblockCrossSize} : {width: scrollblockCrossSize})}
        : styles.scrollblockStyles

    const viewportStyles = selectViewportStyles(orientation, operations.crossAxisChaining)

    // the data-type values cannot be changed - the literals are used in code (to save intersection entries)
    if (errorState.error) {
        throw new Error(errorState.message)
    } else {
        return <>
            <div data-type = 'viewport' data-scrollername = {scrollerName} style = {viewportStyles} onScroll = {onViewportScroll} ref = {viewportRef}>
                <div data-type = 'scrollblock' style = {scrollblockStyle} ref = {scrollblockRef}>
                    <div data-type = 'axis' style = {styles.axisStyles} ref = {axisRef}>
                        <div data-type = 'headblock' style = {styles.headblockStyles} ref = {headblockRef}>
                            <div data-type = 'headblock-overflow-trigger' style = {styles.headblockOverflowTriggerStyles} ref = {headblockOverflowTriggerRef} />
                            <div data-type = 'lead-headblock-band' style = {styles.leadHeadblockBandStyles} ref = {leadHeadblockBandRef}> 
                                <div data-type = 'lead-headblock-band-backward-trigger' style = {styles.leadHeadblockBandBackwardTriggerStyles} ref = {leadHeadblockBandBackwardTriggerRef} />
                            </div>
                        </div>
                        <div data-type = 'tailblock' style = {styles.tailblockStyles} ref = {tailblockRef}>
                            <div data-type = 'lead-tailblock-band' style = {styles.leadTailblockBandStyles} ref = {leadTailblockBandRef}> 
                                <div data-type = 'lead-tailblock-band-forward-trigger' style = {styles.leadTailblockBandForwardTriggerStyles} ref = {leadTailblockBandStartTriggerRef} />
                                <div data-type = 'lead-tailblock-band-end-trigger' style = {styles.leadTailblockBandEndTriggerStyles} ref = {leadTailblockBandEndTriggerRef} />
                            </div>
                            <div data-type = 'tailblock-overflow-trigger' style = {styles.tailblockOverflowTriggerStyles} ref = {tailblockOverflowTriggerRef} />
                        </div>
                        {endIndicators && ['head', 'tail'].map((end) => endIndicators[end] && <div key = {end} data-type = 'end-indicator-slot' style = {endIndicatorSlotStyles(end, orientation, endIndicators.marks[end])}>
                            <endIndicators.Component context = {operations.endIndicatorContext} end = {(end == 'head') ? 'start' : 'end'} searching = {endIndicators[end] == 'searching'} failed = {endIndicators[end] == 'failed'} orientation = {orientation} />
                        </div>)}
                    </div>
                </div>
            </div>
            <div data-type = 'virtual-cradle' style = {virtualCradleStyles}>
                {portalRenderList}
            </div>        
        </>
    }
} // Viewport

export type CellPack = { id: any, component: ReactElement }

// attempt counts the asks for the same cells: 1, then one more at each FETCH_CEILING that passes unanswered.
// signal fires when the answer is no longer wanted: at the ceiling, a structural call, a reset or the unmount
export type FetchContext = { attempt: number, signal: AbortSignal }

export type FetchCells = (startCode: 'at' | 'after' | 'before', referenceID: any, count: number, context: FetchContext) => CellPack[] | Promise<CellPack[]>

// the props of a placeholder component (operations.placeholder): the host's context as given, the placeholder's
// position in the run at its end, counted from the real rows, the direction of that run, and the real row it stands beside
export type PlaceholderProps = { context: any, index: number, direction: 'forward' | 'backward', referenceID: any }

// the props of an end indicator component (operations.endIndicator): the host's context as given, the end of the data
// it stands at, whether the host is being asked there (false once it has answered), whether the host's last answer
// there was a failure, and the list's orientation
export type EndIndicatorProps = { context: any, end: 'start' | 'end', searching: boolean, failed: boolean, orientation: 'vertical' | 'horizontal' }

// the second argument of callbacks.axisReferenceID when the axis stands on a placeholder
export type AxisContext = { isPlaceholder: true, referenceID: any, direction: 'forward' | 'backward' }

export type ReactSuperSimpleScrollerProps = {

    // required
    orientation?:'vertical' | 'horizontal', // default 'vertical'
    layout?:'uniform' | 'variable', // default 'uniform'
    cellDimensions: {
        maxHeight: number,
        maxWidth: number,
        minHeight: number,
        minWidth: number,
    },
    seedReferenceID: any,
    fetchCells: FetchCells,

    // optional
    callbacks?:{
        axisReferenceID?: Function,
        failed?: Function,
        removed?: Function,
        error?: Function,
        warning?: Function,
        resized?: Function,
    }
    calls?: {
        has?: null | Function,
        insert?: null | Function,
        remove?: null | Function,
        move?: null | Function,
        replace?:null | Function,
        getCradleIDList?: null | Function,
        getCradleSpecs?: null | Function,
        fetchCradleCells?: null | Function,
    },
    technical?: {
        STANDARD_SCROLL_MOMENTUM_FADE?: number,
        SHORT_MOMENTUM_FADE?: number,
        FETCH_CEILING?: number, // ms a fetch may go unanswered before the same cells are asked for again; default 5000
    }
    spacing?: {
        cradleMargin?: number[],
        bandPadding?: number[],
        cellGap?: number,
    },
    operations?: {
        dispatchAttachedEvents?:boolean,
        restoreCellScroll?: boolean, // default true: what has scrolled inside a cell is put back when the scroller moves the cell
        runway?: number,
        crossAxisChaining?: boolean, // default true
        placeholderCap?: number, // placeholders ahead of the viewport at each end; 0 turns them off; default 1.5 × a viewport's cells
        placeholderSpreadRatio?: number | null, // variable layout: a placeholder's axis size, from min (0) to max (1); default 0
        placeholder?: React.ComponentType<PlaceholderProps>, // the host's placeholder; default a gray "searching…"
        placeholderContext?: any, // passed to each placeholder untouched; memoize it
        endIndicator?: React.ComponentType<EndIndicatorProps>, // the host's end indicator, shown in the gap a pull opens past an end of the data and gone at rest; default a gray "start of list" / "end of list" / "searching…", and nothing after a failed load
        endIndicatorContext?: any, // passed to the end indicator untouched; the default reads its texts from { start, end, searching, failed }, '' showing none
        fixedEnds?: boolean | { start?: boolean, end?: boolean }, // an end the host closes: nothing is looked for past it; true closes both
    },
    scrollerName? : string
}

// the first five properties are required
const ReactSuperSimpleScroller = (
    {orientation, layout, cellDimensions, seedReferenceID, fetchCells, ...moreProperties}
    : ReactSuperSimpleScrollerProps) => {

    const 
        {callbacks, calls, spacing, operations, technical, scrollerName} = moreProperties,
        properties = {
            orientation, layout, cellDimensions, seedReferenceID, fetchCells,
            callbacks, calls, spacing, operations, technical, scrollerName
        }

    return <ErrorBoundary fallbackRender={fallbackRender}>
        <Viewport {...properties} />
    </ErrorBoundary>

}

export default ReactSuperSimpleScroller
