// ReactSuperSimpleScroller.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

/*
    TODO
    - report null axisReferenceID, including...
        - for failure of seedReferenceID
*/

// ===============================[ resources ]========================

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo, CSSProperties, FC } from 'react'

import { ErrorBoundary } from "react-error-boundary"

import Queue from './Queue'

import { SCROLLBLOCK_SPAN } from './orientationStyles'

// sub-modules
import { isValidID, reportError, reportWarning, errorMessage } from './utilities'
import useCells from './useCells'
import useNewCradlePotential from './useNewCradlePotential'
import useRemoveCells from './useRemoveCells'
import useIntersections from './useIntersections'
import useReset from './useReset'
import useCalls from './useCalls'

import { selectStyles, selectViewportStyles } from './orientationStyles'
import { 
    baseCradleActual, 
    DEFAULT_SPACING,
    validateSpacing,
    validateCellDimensions,
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
            orientation = 'vertical', 
            layout = 'uniform', 
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

        // processing control
        // a task that has waited behind one running task for the queue's stall time is reported: a nested
        // enqueue (a fetchCells that awaits one of the calls) never finishes, and this is how it shows
        DOMManipulationQueueRef = useRef(new Queue({
            onStall: ({ waitedMs, waiting }) => {
                const message = `a cradle operation has waited ${waitedMs} ms behind one that has not finished (${waiting} waiting). ` +
                    'A task that enqueues another task on the same queue and awaits it never finishes: a fetchCells that awaits ' +
                    'insert, remove, move, replace, fetchCradleCells or restoreScrollPositions before it returns is that shape'
                if (callbacksRef.current?.warning) reportWarning(callbacksRef, 'queue', message, [], { waitedMs, waiting })
                else console.warn(`react-super-simple-scroller${scrollerName ? ` (${scrollerName})` : ''}: ${message}`)
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
        lastCellDimensionsCheckRef = useRef(null),
        lastSpacingPropRef = useRef(undefined),
        callbacksRef = useRef(null),
        callsRef = useRef(null),
        operationsRef = useRef(null),
        viewportDimensionsRef = useRef(null),
        cradlePotentialRef = useRef(null),
        scrollerStateRef = useRef(null),

        // set by state change
        spacingRef = useRef(null),
        fetchCellsRef = useRef(fetchCells),

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

        // band tracking -- bands are listed in presentaton order
        headBandListRef = useRef<HTMLElement[]>([]),
        tailBandListRef = useRef<HTMLElement[]>([]),

        // scroll data
        scrollTopRef = useRef(0),
        scrollLeftRef = useRef(0),
        // scrollDirectionVerticalRef = useRef(0),
        // scrollDirectionHorizontalRef = useRef(0),
        [isScrollingMode, setIsScrollingMode] = useState(false),
        immediateIsScrollingRef = useRef(false),
        immediateStopScrollingRef = useRef(false),

        // observers
        intersectionObserverRef = useRef(null),
        intersectionsMapRef = useRef(new Map()), // combined state, for intersections evaluation
        resizeObserverRef = useRef(null),
        cradleMutationObserverRef = useRef(null),
        bandMutationObserverRef = useRef(null),

        // timeout id's
        scrollMomentumTimeoutIDRef = useRef(null),
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
    callsRef.current = calls
    operationsRef.current = operations
    viewportDimensionsRef.current = viewportDimensions
    cradlePotentialRef.current = cradlePotential
    scrollerStateRef.current = scrollerState
    standardMomentumFadeRef.current = technical?.STANDARD_SCROLL_MOMENTUM_FADE ?? DEFAULT_STANDARD_SCROLL_MOMENTUM_FADE
    shortMomentumFadeRef.current = technical?.SHORT_MOMENTUM_FADE ?? DEFAULT_SHORT_MOMENTUM_FADE
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
    // held and flushed by the layout effect below, after the commit of the state the task changed
    const requestIntersectionsConnect = useCallback(() => {

        intersectionsConnectWantedRef.current = true

        assertIntersectionsConnect()

        if (intersectionsConnectWantedRef.current && isMountedRef.current) setConnectTick(tick => tick + 1)

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

    const updateCurrentAxisReferenceID = useCallback(() => {
        const
            currentAxisReferenceID = portalIDListRef.current.at(-cradleActualRef.current.forwardCells)

        if (currentAxisReferenceID !== currentAxisReferenceIDRef.current) {

            currentAxisReferenceIDRef.current = currentAxisReferenceID

            callbacksRef.current.axisReferenceID && callbacksRef.current.axisReferenceID(currentAxisReferenceID)

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

        const
            forwardBandsToRemoveCount = Math.max(cradleActual.forwardBands - cradlePotential.forwardBands,0),
            backwardBandsToRemoveCount = Math.max(cradleActual.backwardBands - cradlePotential.backwardBands,0),
            forwardCellsToRemoveCount = Math.max(cradleActual.forwardCells - (cradlePotential.forwardCells - tailCellOffset),0),
            backwardCellsToRemoveCount = Math.max(cradleActual.backwardCells - cradlePotential.backwardCells,0)

        removeCells({
            forwardCellsToRemoveCount,
            forwardBandsToRemoveCount,
            backwardCellsToRemoveCount,
            backwardBandsToRemoveCount,
        })

    },[])

    const fillCradle = useCallback(async () => { // name to avoid collision with user call 'fillCradle'

        await getCells('forward') // returns promise

        return true

    },[])

    const getSeed = useCallback(async (referenceID) => {

        const callbacks = callbacksRef.current

        if (!isValidID(referenceID)) {
            reportError(callbacksRef, 'getSeed', 'must be a valid referenceID', [referenceID])
            return false
        }

        await getCells('seed', referenceID)

        return true

    },[])

    const resetAxisPosition = useCallback((freshReset = false) => {

        if (!viewportRef.current) return // error condition

        if (orientationRef.current == 'vertical') {

            // freshReset: use offset of 1 to place axis 1px inside the viewport, preventing the
            // intersection observer from seeing the forward trigger as 'before' at the exact boundary.
            const axisOffset = freshReset ? 1 : (axisPositionRef.current.y - viewportRef.current.scrollTop)
            const crossAxis = freshReset ? 0 : viewportRef.current.scrollLeft

            scrollTopRef.current = AXIS_START_POSITION
            scrollLeftRef.current = crossAxis
            viewportRef.current.scrollTo(crossAxis, AXIS_START_POSITION)
            setAxisPosition(0, AXIS_START_POSITION + axisOffset, 'stop scrolling')

        } else { // 'horizontal'

            const axisOffset = freshReset ? 1 : (axisPositionRef.current.x - viewportRef.current.scrollLeft)
            const crossAxis = freshReset ? 0 : viewportRef.current.scrollTop

            scrollLeftRef.current = AXIS_START_POSITION
            scrollTopRef.current = crossAxis
            viewportRef.current.scrollTo(AXIS_START_POSITION, crossAxis)
            setAxisPosition(AXIS_START_POSITION + axisOffset, 0)

        }
    },[])

    // ===================[ breakout code to use* modules ]======================

    const 
        getCells = useCells({

            scrollerName,

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

            // callbacksRef,
            setPortalRenderList,
            fetchCellsRef,
            updateCurrentAxisReferenceID,
            callbacksRef,
            bandMutationObserverRef,
            
        }),

        removeCells = useRemoveCells({
        
            portalIDListRef,
            cellPortalListRef,
            cellDataListRef,
            portalContainerMapRef,

            headBandListRef,
            tailBandListRef,

            cradleActualRef,

            callbacksRef,

        }),

        evaluateIntersections = useIntersections({

            scrollerName,

            DOMManipulationQueueRef,

            orientationRef,

            intersectionsMapRef,
            immediateIsScrollingRef,
            viewportRef,
            immediateStopScrollingRef,
            scrollTopRef,
            scrollLeftRef,
            restoreScrollingTimeoutIDRef,
            standardMomentumFadeRef,
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
            assertIntersectionsDisconnect,
            requestIntersectionsConnect,

            trimCradle,
            fillCradle,
            updateCurrentAxisReferenceID,

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
            getSeed,
            fillCradle,
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
            reset,
            callbacksRef,
            assertIntersectionsDisconnect,
            requestIntersectionsConnect,
            bandMutationObserverRef,
        })

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
        viewportRef.current.addEventListener('rs3restore', handleRs3Restore)

        return () => {
            isMountedRef.current = false
            cancelAnimationFrame(reconcileFrameIDRef.current)
            clearTimeout(scrollMomentumTimeoutIDRef.current)
            clearTimeout(restoreScrollingTimeoutIDRef.current)
            clearTimeout(resizeTimeoutIDRef.current)
            intersectionObserverRef.current.disconnect()
            intersectionsConnectedRef.current = false
            resizeObserverRef.current.disconnect()
            viewportRef.current?.removeEventListener('rs3restore', handleRs3Restore)
        }

    },[])

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
                    const detail = {source: name, message: 'called after the scroller was unmounted; nothing was done', arguments: args, timestamp: Date.now()}
                    callbacksRef.current.warning
                        ? callbacksRef.current.warning(detail)
                        : console.warn(`react-super-simple-scroller${scrollerName ? ` (${scrollerName})` : ''}: ${name} ${detail.message}`)
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

    // TODO reverse scroll direction should cancel immediateStopScrolling
    const onViewportScroll = (event) => {

        const { target } = event

        clearTimeout(scrollMomentumTimeoutIDRef.current)
        if (immediateStopScrollingRef.current) {

            target.scrollTo(scrollLeftRef.current, scrollTopRef.current)

        } else {

            scrollTopRef.current = target.scrollTop
            scrollLeftRef.current = target.scrollLeft

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

        if (!isScrollingMode) {
            immediateIsScrollingRef.current = true
            setIsScrollingMode(true)
        }
        scrollMomentumTimeoutIDRef.current = setTimeout(()=>{
            setIsScrollingMode(false)
        },standardMomentumFadeRef.current)
    }

    // =========================[ reconfiguration effects ]=====================

    useEffect(()=>{

        let cradleMutationObserver, bandMutationObserver
        if (operations.dispatchAttachedEvents) {

            const event = new Event('rs3attached')

            const 
                cradleCallback = (mutationList) => {
                    mutationList.forEach((mutationRecord) => {
                        mutationRecord.addedNodes.forEach((band) => {
                            for (let index = 0; index < band.children.length; index++) {
                                const child = band.children[index]
                                child.firstChild && child.firstChild.dispatchEvent(event)
                            }
                        })
                    })
                }

            const
                bandCallback = (mutationList) => {
                    mutationList.forEach((mutationRecord) => {
                        mutationRecord.addedNodes.forEach((node) => {
                            node.firstChild && node.firstChild.dispatchEvent(event)
                        })
                    })
                }

            cradleMutationObserverRef.current = cradleMutationObserver = new MutationObserver(cradleCallback)

            cradleMutationObserver.observe(headblockRef.current, {childList:true})
            cradleMutationObserver.observe(leadHeadblockBandRef.current, {childList:true})
            cradleMutationObserver.observe(tailblockRef.current, {childList:true})
            cradleMutationObserver.observe(leadTailblockBandRef.current, {childList:true})

            bandMutationObserverRef.current = bandMutationObserver = new MutationObserver(bandCallback)

            const 
                headBandList = headBandListRef.current,
                tailBandList = tailBandListRef.current

            headBandList.forEach((band) => {
                bandMutationObserver.observe(band, {childList:true})
            })

            tailBandList.forEach((band) => {
                bandMutationObserver.observe(band, {childList:true})
            })

        } else {
            cradleMutationObserverRef.current && cradleMutationObserverRef.current.disconnect()
            bandMutationObserverRef.current && bandMutationObserverRef.current.disconnect()
        }

        return () => {
            cradleMutationObserverRef.current && cradleMutationObserverRef.current.disconnect()
            bandMutationObserverRef.current && bandMutationObserverRef.current.disconnect()
        }

    },[operations.dispatchAttachedEvents])

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

        if (scrollerStateRef.current == 'setup') return

        if (!isScrollingMode) {

            resetAxisPosition()
            // reset scrolling control
            immediateIsScrollingRef.current = false

            // a crossing that happened after the last observer callback has no callback left to
            // catch it, and a stranded cradle produces none
            if (intersectionsConnectedRef.current &&
                reconcileUnreportedCrossings(viewportRef.current.getBoundingClientRect())) {

                evaluateIntersections('scroll end')

            }

        }
    },[isScrollingMode])

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
                    </div>
                </div>
            </div>
            <div data-type = 'virtual-cradle' style = {virtualCradleStyles}>
                {portalRenderList}
            </div>        
        </>
    }
} // Viewport

// the first five properties are required
const ReactSuperSimpleScroller = (
    {orientation, layout, cellDimensions, seedReferenceID, fetchCells, ...moreProperties}
    :{ // simple parameter typing...

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
        fetchCells:  (direction:'seed' | 'forward' | 'backward', referenceID: any, count: number) => Promise<{id:any, component: FC}[]>,
        
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
        }
        spacing?: {
            cradleMargin?: number[],
            bandPadding?: number[],
            cellGap?: number,
        },
        operations?: {
            dispatchAttachedEvents?:boolean,
            runway?: number,
            crossAxisChaining?: boolean, // default true
        },
        scrollerName? : string
    }) => {

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
