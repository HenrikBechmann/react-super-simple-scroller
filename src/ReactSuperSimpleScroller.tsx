// ReactSuperSimpleScroller.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

// ===============================[ resources ]========================

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, CSSProperties, FC } from 'react'

import { ErrorBoundary } from "react-error-boundary"

import Queue from './Queue'

import { SCROLLBLOCK_SPAN } from './orientationStyles'

// sub-modules
import { isValidID } from './utilities'
import useCells from './useCells'
import useNewCradlePotential from './useNewCradlePotential'
import useRemoveCells from './useRemoveCells'
import useIntersections from './useIntersections'
import useReset from './useReset'
import useCalls from './useCalls'

import { selectStyles } from './orientationStyles'
import { 
    baseCradleActual, 
    getCradleMarginsFromSpacing, 
    getBandPaddingFromSpacing, 
    getCellGapFromSpacing,
} from './utilities'

const
    AXIS_START_POSITION = SCROLLBLOCK_SPAN/2,

    // defaults for below
    DEFAULT_STANDARD_SCROLL_MOMENTUM_FADE = 700,
    DEFAULT_SHORT_MOMENTUM_FADE = 200,
    DEFAULT_RUNWAY_BANDS = 4

let // can be set by parameter
    STANDARD_SCROLL_MOMENTUM_FADE = DEFAULT_STANDARD_SCROLL_MOMENTUM_FADE,
    SHORT_MOMENTUM_FADE = DEFAULT_SHORT_MOMENTUM_FADE, // only first time for resize callback
    RUNWAY_BANDS = DEFAULT_RUNWAY_BANDS

// ===============================[ styles ]==========================

// common styles

const viewportStyles = {
    position:'absolute',
    inset:0,
    // backgroundColor:'cyan',
    overflow:'auto',
    scrollbarWidth:'none',
    overscrollBehavior:'none',
    overflowAnchor:'none',
} as CSSProperties

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
            cellDimensions, 
            seedReferenceID, 
            fetchCells,
            callbacks = defaultCallbacksRef.current, 
            calls,
            spacing = defaultSpacingRef.current,
            operations = defaultOperationsRef.current,
            scrollerName = 'not named'
        } = props,

        // processing control
        DOMManipulationQueueRef = useRef(new Queue),
        intersectionsConnectedRef = useRef(false),

        // comparisons with the following lead to reset
        previousOrientationRef = useRef(orientation),
        previousLayoutRef = useRef(layout),
        previousCellDimensionsRef = useRef(cellDimensions),
        previousSpacingRef = useRef(spacing),
        previousSeedReferenceIDRef = useRef(seedReferenceID),
        previousFetchCellsRef = useRef(fetchCells),

        // set every cycle for immediate accessibility
        orientationRef = useRef(null),
        layoutRef = useRef(null),
        cellDimensionsRef = useRef(null),
        seedReferenceIDRef = useRef(null),
        callbacksRef = useRef(null),
        callsRef = useRef(null),
        operationsRef = useRef(null),
        viewportDimensionsRef = useRef(null),
        cradlePotentialRef = useRef(null),
        scrollerStateRef = useRef(null),

        // set by state change
        spacingRef = useRef(null),
        fetchCellsRef = useRef(fetchCells),

        // base states
        [scrollerState,setScrollerState] = useState('setup'),
        [viewportDimensions,setViewportDimensions] = useState(null),
        hasJustResizedRef = useRef(false),
        [styles, setStyles] = useState(selectStyles(orientation)),

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
        resizeTimeoutIDRef = useRef(null)

    // for immediately accessibility
    orientationRef.current = orientation
    layoutRef.current = layout
    cellDimensionsRef.current = cellDimensions
    seedReferenceIDRef.current = seedReferenceID
    // fetchCellsRef.current set separately
    // spacingRef.current = set separately
    callbacksRef.current = callbacks
    callsRef.current = calls
    operationsRef.current = operations
    viewportDimensionsRef.current = viewportDimensions
    cradlePotentialRef.current = cradlePotential
    scrollerStateRef.current = scrollerState

    // --- component utility functions

    const assertIntersectionsDisconnect = useCallback(() => {

        if (!intersectionsConnectedRef.current) return

        intersectionObserverRef.current.disconnect()

        intersectionsConnectedRef.current = false

    },[])

    const assertIntersectionsConnect = useCallback(() => {

        if (intersectionsConnectedRef.current) return

        if (DOMManipulationQueueRef.current.queue.length) return

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
            if (callbacks.error) {
                callbacks.error(
                    {
                        source: 'getSeed',
                        message:'must be a valid referenceID',
                        arguments: [referenceID],
                        timestamp: Date.now()
                    }
                )
            }
            return false
        }

        await getCells('seed', referenceID)

        return true

    },[])

    const resetAxisPosition = useCallback(() => {

        if (!viewportRef.current) return // error condition

        if (orientationRef.current == 'vertical') {

            const axisOffset = axisPositionRef.current.y - viewportRef.current.scrollTop

            scrollTopRef.current = AXIS_START_POSITION
            viewportRef.current.scrollTo(scrollLeftRef.current,AXIS_START_POSITION)
            setAxisPosition(0,AXIS_START_POSITION + axisOffset, 'stop scrolling') 

        } else { // 'horizontal'

            const axisOffset = axisPositionRef.current.x - viewportRef.current.scrollLeft
                
            scrollLeftRef.current = AXIS_START_POSITION
            viewportRef.current.scrollTo(AXIS_START_POSITION,scrollTopRef.current)
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
            STANDARD_SCROLL_MOMENTUM_FADE,
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

            // callbacksRef,
            setAxisPosition,
            assertIntersectionsDisconnect,
            assertIntersectionsConnect,

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
            assertIntersectionsConnect,
            getSeed,
            callbacksRef,
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
            assertIntersectionsConnect,
            setPortalRenderList,
            removeCells,
            getSeed,
            fillCradle,
            updateCurrentAxisReferenceID,
            bandMutationObserverRef,

        }),


        availableCalls = useCalls({

            RUNWAY_BANDS,

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
        })

    // ==============================[ initialization effects ]========================

    useEffect(()=>{

        // report initial axisReferencerID (seedReferencerID)
        callbacksRef.current.axisReferenceID && callbacksRef.current.axisReferenceID(currentAxisReferenceIDRef.current)

        return () => {
            viewportRef.current && viewportRef.current.remove() // abundance of caution
        }

    },[])

    // set spacing values
    useEffect(()=>{

        cradleMarginsRef.current = getCradleMarginsFromSpacing(spacing)
        bandPaddingRef.current = getBandPaddingFromSpacing(spacing)
        cellGapRef.current = getCellGapFromSpacing(spacing)
        spacingRef.current = {
            cradleMargin: cradleMarginsRef.current,
            bandPadding: bandPaddingRef.current,
            cellGap: cellGapRef.current
        }

    },[spacing])

    // set up IntersectionObserver, ResizeObserver and MutationObserver
    useEffect(()=>{

        const iObserver = intersectionObserverRef.current = 
            new IntersectionObserver(intersectionObserverCallback,{
                root:viewportRef.current,
            })

        const rObserver = resizeObserverRef.current = 
            new ResizeObserver(resizeObserverCallback)

        rObserver.observe(viewportRef.current)

        return () => {
            intersectionObserverRef.current.disconnect()
            resizeObserverRef.current.disconnect()
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

        Object.assign(calls, availableCalls)

    },[calls])

    // ===========================[ callbacks ]=========================

    const intersectionObserverCallback = useCallback((entries, observer)=> {

        entries.sort((a,b)=>{
            return a.time - b.time // ascending
        })

        entries.forEach((entry)=>{
            if (orientationRef.current == 'vertical') {
                entry.rs3position = 
                    entry.isIntersecting
                        ?'in'
                        :entry.rootBounds.top > entry.boundingClientRect.bottom
                            ?'before'
                            :'after'
            } else { // 'horizontal'
                entry.rs3position = 
                    entry.isIntersecting
                        ?'in'
                        :entry.rootBounds.left > entry.boundingClientRect.right
                            ?'before'
                            :'after'
            }
            intersectionsMapRef.current.set(entry.target.dataset.type, entry)
        })

        evaluateIntersections('observer')

    },[])

    const resizeObserverCallback = useCallback((entries) => {

        const 
            viewportEntry = entries[0],
            borderBox = viewportEntry.borderBoxSize[0],
            width = borderBox.inlineSize,
            height = borderBox.blockSize

        assertIntersectionsDisconnect()

        const timeout = (scrollerState == 'setup')?SHORT_MOMENTUM_FADE:STANDARD_SCROLL_MOMENTUM_FADE

        clearTimeout(resizeTimeoutIDRef.current)
        resizeTimeoutIDRef.current = setTimeout(()=>{

            if (scrollerState == 'setup') {
                setScrollerState('ready') // measurements available
            }

            hasJustResizedRef.current = true
            setViewportDimensions({width,height})

        }, timeout)

    },[scrollerState])

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

        if (!isScrollingMode) {
            immediateIsScrollingRef.current = true
            setIsScrollingMode(true)
        }
        scrollMomentumTimeoutIDRef.current = setTimeout(()=>{
            setIsScrollingMode(false)
        },STANDARD_SCROLL_MOMENTUM_FADE)
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

    // configure cradlePotential on change of cellDimensions, viewportDimensions, orientation, layout or RUNWAY_BANDS
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

            cellsPerBand = Math.ceil((viewportDimensions.width - (cradleMarginStart + cradleMarginEnd) + cellGap)/(cellMaxWidth + cellGap))

            if (layout == 'uniform') {

                visibleBands = Math.ceil(viewportDimensions.height/(cellMaxHeight + bandPadding))

            } else { // 'variable'

                visibleBands = Math.ceil(viewportDimensions.height/(cellMinHeight + bandPadding))

            }

        } else { // 'horizontal'

            cellsPerBand = Math.ceil((viewportDimensions.height - (cradleMarginStart + cradleMarginEnd) + cellGap)/(cellMaxHeight + cellGap))

            if (layout == 'uniform') {

                visibleBands = Math.ceil(viewportDimensions.width/(cellMaxWidth + bandPadding))

            } else { // 'variable'

                visibleBands = Math.ceil(viewportDimensions.width/(cellMinWidth + bandPadding))

            }

        }

        if (cellsPerBand <= 0) {
            const msg = 'A scroller fatal error occured: cellsPerBand calculated to 0, resulting in an undefined state.\
             Scroller container width and height must always be able to accommodate content. Scroller operation halted.'
            console.log(msg)
            setErrorState({error:true, message: msg})
            return
        }

        const runwayBands = RUNWAY_BANDS

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
            runway:RUNWAY_BANDS,
        }

        if (cradleActualRef.current.cellsPerBand === null) {
            cradleActualRef.current.cellsPerBand = cellsPerBand
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

    },[orientation, layout, cellDimensions, spacing, viewportDimensions, RUNWAY_BANDS])

    // reconfigure cradle on change of cradlePotential
    useLayoutEffect(()=>{

        if (!cradlePotential) return // setup

        if (previousOrientationRef.current !== orientationRef.current ||
            previousLayoutRef.current !== layoutRef.current ||
            previousCellDimensionsRef.current !== cellDimensionsRef.current ||
            previousSpacingRef.current !== spacingRef.current) {

            previousOrientationRef.current = orientationRef.current
            previousLayoutRef.current = layoutRef.current
            previousCellDimensionsRef.current = cellDimensionsRef.current
            previousSpacingRef.current = spacingRef.current

            // prevent duplicate call from useEffect for seedRferenceID or fetchCells below
            previousSeedReferenceIDRef.current = seedReferenceIDRef.current
            previousFetchCellsRef.current = fetchCellsRef.current

            DOMManipulationQueueRef.current.enqueue(async () => {
                await reset(currentAxisReferenceIDRef.current)
                assertIntersectionsConnect()
            })

        } else {

            DOMManipulationQueueRef.current.enqueue(async () => {
                await applyNewCradlePotential(cradlePotential)
                assertIntersectionsConnect()
            })

        }

    },[cradlePotential])

    // reset based on new seedReferenceID or fetchCells
    useLayoutEffect(()=>{

        if (scrollerStateRef.current == 'setup') return

        fetchCellsRef.current = fetchCells

        if ((previousSeedReferenceIDRef.current === seedReferenceIDRef.current) &&
            (previousFetchCellsRef.current === fetchCells)) {

            return
        }

        const referenceIDSelection = 
            (previousSeedReferenceIDRef.current !== seedReferenceID)
                ? seedReferenceID
                : currentAxisReferenceIDRef.current

        previousSeedReferenceIDRef.current = seedReferenceIDRef.current
        previousFetchCellsRef.current = fetchCellsRef.current

        DOMManipulationQueueRef.current.enqueue(async () => {
            await reset(referenceIDSelection)
            assertIntersectionsConnect()
        })

    },[seedReferenceID, fetchCells])

    // ==============================[ scrolling adjustments ]===============================

    useLayoutEffect(()=>{

        if (scrollerStateRef.current == 'setup') return

        if (!isScrollingMode) {

            resetAxisPosition()
            // reset scrolling control
            immediateIsScrollingRef.current = false

        }
    },[isScrollingMode])

    // =============================[ render ]=======================

    // the data-type values cannot be changed - the literals are used in code (to save intersection entries)
    if (errorState.error) {
        throw new Error(errorState.message)
    } else {
        return <>
            <div data-type = 'viewport' data-scrollername = {scrollerName} style = {viewportStyles} onScroll = {onViewportScroll} ref = {viewportRef}>
                <div data-type = 'scrollblock' style = {styles.scrollblockStyles} ref = {scrollblockRef}>
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
            runway?: number
        },
        scrollerName? : string
    }) => {

    const 
        {callbacks, calls, spacing, operations, scrollerName} = moreProperties,
        properties = {
            orientation, layout, cellDimensions, seedReferenceID, fetchCells,
            callbacks, calls, spacing, operations, scrollerName
        },
        { technical } = moreProperties // technical for internal constants

    useEffect(()=>{
        const 
            techvalues = technical ?? {},
            operationsvalues = operations ?? {}

        STANDARD_SCROLL_MOMENTUM_FADE = techvalues.STANDARD_SCROLL_MOMENTUM_FADE ?? DEFAULT_STANDARD_SCROLL_MOMENTUM_FADE
        SHORT_MOMENTUM_FADE = techvalues.SHORT_MOMENTUM_FADE ?? DEFAULT_SHORT_MOMENTUM_FADE
        RUNWAY_BANDS = operations?.runway ?? DEFAULT_RUNWAY_BANDS

    },[technical])

    return <ErrorBoundary fallbackRender={fallbackRender}>
        <Viewport {...properties} />
    </ErrorBoundary>

}

export default ReactSuperSimpleScroller
