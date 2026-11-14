// useCells.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React from 'react'
import { createPortal } from 'react-dom'

import { createBand, createContainer, setPlaceholderSpread, clearPlaceholderSpread, removeEmptyBands, isValidID, reportError, reportFailed, reportWarning, errorMessage } from './utilities'
import { DefaultPlaceholder, DefaultEndIndicator, placeholderID } from './placeholders'

// Two ways to grow the cradle, chosen by operations.placeholderCap.
//
// With the cap at 0 the host's fetch is awaited where the fill runs: the cradle grows when the answer comes, and
// nothing shows in the meantime (getCellsInline).
//
// With a cap above 0 a fill first places placeholder cells in the positions it would ask for, within the cradle's
// room at each end, so the list grows at once and the layout holds while the host answers. The cap bounds the
// placeholders still ahead of the viewport at each end: a fill first withdraws the bands of a run that the scroll
// has carried wholly behind the viewport (the host never saw them, and no answer is owed on them), and counts
// what is left.
// One fetch is out at a time. It is asked for the last real row's id (the first, backward) and the count of the
// placeholders standing at that end, and its answer fills by position, in place, in the one container, so a fill
// moves nothing: item k fills the placeholder standing k-th from the real rows when the answer lands, so the rows
// stay in sequence from the row the ask named whichever placeholders the scroll has withdrawn, trimmed or stood
// since. A short answer leaves the rest standing, re-anchored on the new last real row for the next ask; an empty
// answer is the end of the data at that end and takes the rest down. Positions past the answer's count wait for
// the next ask. A fetch unanswered within technical.FETCH_CEILING is dropped, its signal fired, and the same
// positions asked for again, once per ceiling, for as long as they stand. A structural call, a reset or the
// unmount withdraws the standing placeholders and drops the pending answer.
// One ask stands no placeholders: the one the end state makes at an end the host has answered empty at, or failed
// to answer (clearQuietAt sets its record, isEndAskAt reads it). Nothing is placed at that end for it, its count is
// the cradle's room there, and its rows are added past the end row (addAtEnd, through the adders the inline path
// uses). The fill that follows those rows is an ordinary one.
const useCells = ({

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
    bringOutrunCradleRef,
    updateCurrentAxisReferenceID,
    currentAxisReferenceIDRef,
    callbacksRef,
    bandMutationObserverRef,
    requestIntersectionsConnect,
    trimCradle,

}) => {

    const placeholderState = () => placeholdersRef.current

    // an option that cannot be used is reported once per option and value for the scroller's life, and the default
    // stands in for it. The record lives in the placeholder state, not the render, so a re-render does not report again
    const reportBadOption = (name, value, message) => {
        const
            badOptions = placeholderState().badOptions,
            reported = badOptions.get(name) ?? badOptions.set(name, new Set()).get(name)
        if (reported.has(value)) return
        reported.add(value)
        reportError(callbacksRef, name, message, [value])
    }

    const placeholderCap = () => {

        const
            cap = operationsRef.current?.placeholderCap,
            cradlePotential = cradlePotentialRef.current

        if (cap === undefined || cap === null) {
            return Math.ceil(1.5 * cradlePotential.cellsPerBand * cradlePotential.visibleBands)
        }

        if ((typeof cap == 'number') && Number.isFinite(cap) && (cap >= 0)) return Math.floor(cap)

        reportBadOption('operations.placeholderCap', cap, 'must be a number of 0 or more; the default is used')

        return Math.ceil(1.5 * cradlePotential.cellsPerBand * cradlePotential.visibleBands)

    }

    const placeholderSpreadRatio = () => {

        const ratio = operationsRef.current?.placeholderSpreadRatio

        if (ratio === undefined || ratio === null) return 0

        if ((typeof ratio == 'number') && Number.isFinite(ratio) && (ratio >= 0) && (ratio <= 1)) return ratio

        reportBadOption('operations.placeholderSpreadRatio', ratio, 'must be a number from 0 to 1; the default is used')

        return 0

    }

    const placeholderComponentType = () => {

        const Component = operationsRef.current?.placeholder

        if (Component === undefined || Component === null) return DefaultPlaceholder

        if (typeof Component == 'function' || (typeof Component == 'object')) return Component

        reportBadOption('operations.placeholder', Component, 'must be a component; the default placeholder is used')

        return DefaultPlaceholder

    }

    const endIndicatorComponentType = () => {

        const Component = operationsRef.current?.endIndicator

        if (Component === undefined || Component === null) return DefaultEndIndicator

        if (typeof Component == 'function' || (typeof Component == 'object')) return Component

        reportBadOption('operations.endIndicator', Component, 'must be a component; the default end indicator is used')

        return DefaultEndIndicator

    }

    // operations.fixedEnds: the host's word that nothing is to be looked for past an end. true closes both ends; an
    // object closes the end it names true (start: the head, end: the tail)
    const isEndFixed = (end) => {

        const fixedEnds = operationsRef.current?.fixedEnds

        if (fixedEnds === undefined || fixedEnds === null || (typeof fixedEnds == 'boolean')) return !!fixedEnds

        if (typeof fixedEnds == 'object') return ((end == 'head') ? fixedEnds.start : fixedEnds.end) === true

        reportBadOption('operations.fixedEnds', fixedEnds, 'must be a boolean or { start, end }; neither end is fixed')

        return false

    }

    // -------------------------[ the host's fetch ]-------------------------

    // the signal given to a fetch made with placeholders off: it fires at a reset and at the unmount
    const inlineSignal = () => {
        const state = placeholderState()
        if (!state.inlineController || state.inlineController.signal.aborted) state.inlineController = new AbortController()
        return state.inlineController.signal
    }

    // A host fetch that rejects, or answers with anything but an array, is reported and read as an empty
    // batch: the pass ends there and the next scroll asks again. An empty array is the end of the data.
    const fetchBatch = async (fetchCells, startCode, referenceID, count) => {

        let cells

        try {

            cells = await fetchCells(startCode, referenceID, count, {attempt: 1, signal: inlineSignal()})

        } catch (error) {

            leadTailblockBandRef.current && reportError(callbacksRef, `fetchCells, ${startCode}`,
                `fetchCells rejected: ${errorMessage(error)}`, [startCode, referenceID, count])

            return []

        }

        if (!Array.isArray(cells)) {

            leadTailblockBandRef.current && reportError(callbacksRef, `fetchCells, ${startCode}`,
                'fetchCells must return an array of cellPacks', [startCode, referenceID, count], {return: cells})

            return []

        }

        return cells

    }

    // call 'at' or 'after', never 'before' (called by after)
    const getCells = async (startCode, seedReferenceID = null) => { // second parm for 'at' option

        if (!tailblockRef.current || !headblockRef.current || !leadTailblockBandRef.current) return

        if (!cradlePotentialRef.current) return // uninitialized

        if (placeholderCap() === 0) return getCellsInline(startCode, seedReferenceID)

        return getCellsWithPlaceholders(startCode, seedReferenceID)

    }

    // =========================[ placeholders off: the fetch awaited in place ]=========================

    const getCellsInline = async (startCode, seedReferenceID) => {

        const
            cradlePotential = cradlePotentialRef.current,
            cradleActual = cradleActualRef.current,
            fetchCells = fetchCellsRef.current

        if (startCode == 'at') {

            const
                count = cradlePotential.forwardCells,
                newCells = await fetchBatch(fetchCells, startCode, seedReferenceID, count)

            // Re-check: scroller may have been reset/unmounted while fetchCells was in-flight
            if (!leadTailblockBandRef.current || cradleActualRef.current !== cradleActual) return

            if (newCells.length > count) {
                const excess = newCells.splice(count)
                if (excess.length) {
                    const excessIDList = excess.map((cellPack) => cellPack?.id)
                    reportFailed(callbacksRef, 'fetchCells, at', 'too many cellPacks; excess not loaded', excessIDList)
                }
            }

            if (newCells.length) {

                const newPortalList = setForwardCells(newCells, 'fetchCells, at')
                if (newPortalList.length === cellPortalListRef.current.length) { // something went wrong
                    reportError(callbacksRef, 'fetchCells, at', 'one or more errors found in fetched cellPacks. Loading aborted', [startCode, seedReferenceID, count], {return: newCells})
                    return
                }
                cellPortalListRef.current = newPortalList
                setPortalRenderList(newPortalList)

                updateCurrentAxisReferenceID()

            }

            // nothing at the reference: there is no row to fetch after or before from
            if (!cellPortalListRef.current.length) return

            await getCellsInline('after', null)

        } else if (startCode == 'after') {

            const tailBandList = tailBandListRef.current

            let offset = 0
            if (tailBandList.length > 1) {
                offset = cradleActual.cellsPerBand - tailBandList[0].childElementCount
            }

            // the end memory gates the ask here as it gates the placeholder fill: an end the host has answered is asked
            // again only once input reaches it (clearQuietAt), not on every shift into the room past the last row
            let moreExpected = !isQuietAt('forward')
            while ((cradleActual.forwardCells < (cradlePotential.forwardCells - offset)) && moreExpected) {

                const
                    count = cradlePotential.forwardCells - cradleActual.forwardCells

                let newCells = []
                if (count > 0) {
                    newCells = await fetchBatch(fetchCells, startCode, portalIDListRef.current.at(-1), count)
                }

                if (!leadTailblockBandRef.current || cradleActualRef.current !== cradleActual) return

                if (newCells.length > count) {
                    const excess = newCells.splice(count)
                    if (excess.length) {
                        const excessIDList = excess.map((cellPack) => cellPack?.id)
                        reportFailed(callbacksRef, 'fetchCells, after', 'too many cellPacks; excess not loaded', excessIDList)
                    }
                }

                if (!newCells.length) {

                    moreExpected = false

                } else {

                    const newPortalList = setForwardCells(newCells)
                    if (newPortalList.length === cellPortalListRef.current.length) { // something went wrong
                        reportError(callbacksRef, 'fetchCells, after', 'one or more errors found in fetched cellPacks. Loading aborted', [startCode, portalIDListRef.current.at(-1), count], {return: newCells})
                        break
                    }
                    cellPortalListRef.current = newPortalList
                    setPortalRenderList(newPortalList)

                    updateCurrentAxisReferenceID()

                }

            }

            await getCellsInline('before', null)

        } else if (startCode == 'before') {

            let moreExpected = !isQuietAt('backward')
            while ((cradleActual.backwardCells < cradlePotential.backwardCells) && moreExpected) {

                const
                    count = cradlePotential.backwardCells - cradleActual.backwardCells

                let newCells = []
                if (count > 0) {
                    newCells = await fetchBatch(fetchCells, startCode, portalIDListRef.current[0], count)
                }

                if (!leadTailblockBandRef.current || cradleActualRef.current !== cradleActual) return

                if (newCells.length > count) {
                    const excess = newCells.splice(count)
                    if (excess.length) {
                        const excessIDList = excess.map((cellPack) => cellPack?.id)
                        reportFailed(callbacksRef, 'fetchCells, before', 'too many cellPacks; excess not loaded', excessIDList)
                    }
                }

                if (!newCells.length) {

                    moreExpected = false

                    // the head's end of the data, as the host answered it: the handler that enters the end state hears
                    // it here as it hears a run's empty answer. Unheard, each scroll into the end showed the space
                    // past the first row and asked again
                    onRunEndedRef.current && onRunEndedRef.current('backward', 'end')

                } else {

                    const newPortalList = setBackwardCells(newCells)
                    if (newPortalList.length === cellPortalListRef.current.length) { // something went wrong
                        reportError(callbacksRef, 'fetchCells, before', 'one or more errors found in fetched cellPacks. Loading aborted', [startCode, portalIDListRef.current[0], count], {return: newCells})
                        break
                    }
                    cellPortalListRef.current = newPortalList
                    setPortalRenderList(newPortalList)

                    updateCurrentAxisReferenceID()

                }

            }

        }

    }

    // =========================[ placeholders on: placed first, filled by position ]=========================

    // the placeholders standing at an end, nearest the real rows first: a placeholder's index is its distance from
    // them, and the run grows at its far end. Where no real row stands between the two runs, a placeholder belongs
    // to the end it was placed for
    const standingAt = (direction) => {

        const
            portalIDList = portalIDListRef.current,
            map = placeholderState().map,
            ids = []

        if (direction == 'forward') {
            for (let index = portalIDList.length - 1; index >= 0; index--) {
                if (map.get(portalIDList[index])?.direction !== 'forward') break
                ids.push(portalIDList[index])
            }
        } else {
            for (let index = 0; index < portalIDList.length; index++) {
                if (map.get(portalIDList[index])?.direction !== 'backward') break
                ids.push(portalIDList[index])
            }
        }

        return ids.reverse()

    }

    const lastRealID = () => {
        const portalIDList = portalIDListRef.current, map = placeholderState().map
        for (let index = portalIDList.length - 1; index >= 0; index--) {
            if (!map.has(portalIDList[index])) return portalIDList[index]
        }
        return undefined
    }

    const firstRealID = () => {
        const portalIDList = portalIDListRef.current, map = placeholderState().map
        for (let index = 0; index < portalIDList.length; index++) {
            if (!map.has(portalIDList[index])) return portalIDList[index]
        }
        return undefined
    }

    // the index of the real row the run standing at an end is anchored on, or -1 where no run stands there. The
    // trim reads it: that row is never trimmed, because the next ask is made from it and an empty answer leaves
    // the cradle standing on it
    const runAnchorIndex = (direction) => {
        if (!standingAt(direction).length) return -1
        const anchor = (direction == 'forward')?lastRealID():firstRealID()
        return (anchor === undefined)?-1:portalIDListRef.current.indexOf(anchor)
    }

    const forwardRoom = () => {

        const
            cradlePotential = cradlePotentialRef.current,
            cradleActual = cradleActualRef.current,
            tailBandList = tailBandListRef.current,
            offset = (tailBandList.length > 1)?(cradleActual.cellsPerBand - tailBandList[0].childElementCount):0

        return Math.max(cradlePotential.forwardCells - offset - cradleActual.forwardCells, 0)

    }

    const backwardRoom = () => Math.max(cradlePotentialRef.current.backwardCells - cradleActualRef.current.backwardCells, 0)

    const roomAt = (direction) => {

        return (direction == 'forward')?forwardRoom():backwardRoom()

    }

    const endID = (direction) => (direction == 'forward')?portalIDListRef.current.at(-1):portalIDListRef.current[0]

    // the one end memory: the host's last answer at this end closed the run, with nothing (end) or with a failure.
    // The end state reads it too (useIntersections marks through it). It carries no scroll position: the state's snap
    // moves the viewport with no input, and a mark keyed on the position dropped on every shift and asked again
    const markQuiet = (direction, reason) => {

        return placeholderState().quiet[direction] = {
            reason,
            cradleActual: cradleActualRef.current,
            endID: endID(direction),
        }

    }

    // the mark stands until the end state asks its end again (clearQuietAt), a structural call or a reset
    // (clearQuietMarks), a new cradle, or a change of the cell at that end; it is cleared when read otherwise
    const isQuietAt = (direction) => {

        const
            state = placeholderState(),
            mark = state.quiet[direction]

        if (!mark) return false

        const stands = (mark.cradleActual === cradleActualRef.current) && (mark.endID === endID(direction))

        if (!stands) state.quiet[direction] = null

        return stands

    }

    const clearQuietMarks = () => {
        const state = placeholderState()
        state.quiet.forward = null
        state.quiet.backward = null
        state.endAsk.forward = null
        state.endAsk.backward = null
    }

    // a gesture past an end's mark asks there again (the end state's re-ask). With placeholders on, that ask stands
    // none at its end: the record says so to the fill and to the answer (isEndAskAt)
    const clearQuietAt = (end) => {

        const
            state = placeholderState(),
            direction = (end == 'tail')?'forward':'backward'

        state.quiet[direction] = null

        if (placeholderCap() > 0) state.endAsk[direction] = {cradleActual: cradleActualRef.current, endID: endID(direction)}

    }

    // an end the end state is asking again, with placeholders on: {cradleActual, endID}. Nothing is placed at that end
    // for the ask, and its rows are added there (applyAnswer). It stands while the cradle and the row at that end are as
    // they were when it was set
    const isEndAskAt = (direction) => {

        const
            state = placeholderState(),
            record = state.endAsk[direction]

        if (!record) return false

        if ((record.cradleActual !== cradleActualRef.current) || (record.endID !== endID(direction))) {
            state.endAsk[direction] = null
            return false
        }

        return true

    }

    const placeholderPortal = (id, entry) => {

        const Component = placeholderComponentType()

        return createPortal(
            <Component context={operationsRef.current?.placeholderContext} index={entry.index}
                direction={entry.direction} referenceID={entry.referenceID} />,
            portalContainerMapRef.current.get(id), id)

    }

    const makePlaceholders = (direction, count, referenceID) => {

        const
            state = placeholderState(),
            base = standingAt(direction).length,
            packs = []

        for (let k = 0; k < count; k++) {
            const
                id = placeholderID(state.generation, ++state.serial),
                entry = {direction, referenceID, askID: null, index: base + k}
            state.map.set(id, entry)
            packs.push({id, entry})
        }

        return packs

    }

    // the bands of the run at an end that the scroll has carried wholly behind the viewport are withdrawn: they are
    // the cradle's own, the host never saw them, and no answer is owed on them. Only the run's part across the axis
    // from its end is read. A run crosses the axis on a shift, and no shift runs toward an end whose state stands,
    // so the placeholders of an end state's re-ask are never among them. Whole bands go, so every band left is as
    // full as it was: the band the run shares with its anchor row stays, and its placeholders are answered as behind
    // for the cap to leave out. With no real row standing the run is the opening's, and it stays as it is
    const withdrawPassed = (direction) => {

        const
            forward = (direction == 'forward'),
            run = standingAt(direction),
            portalIDList = portalIDListRef.current,
            backwardCells = cradleActualRef.current.backwardCells,
            crossed = forward
                ? Math.max(backwardCells - (portalIDList.length - run.length), 0)
                : Math.max(run.length - backwardCells, 0),
            none = {withdrawn: 0, behind: 0}

        if (!crossed || ((forward?lastRealID():firstRealID()) === undefined)) return none

        const
            viewportRect = viewportRef.current.getBoundingClientRect(),
            vertical = (orientationRef.current == 'vertical')

        // a viewport with no box covers nothing, and nothing stands behind it
        if (!(vertical?viewportRect.height:viewportRect.width)) return none

        const
            bandList = forward?headBandListRef.current:tailBandListRef.current,
            isPassed = (band) => {
                const rect = band.getBoundingClientRect()
                return forward
                    ? (vertical?(rect.bottom <= viewportRect.top):(rect.right <= viewportRect.left))
                    : (vertical?(rect.top >= viewportRect.bottom):(rect.left >= viewportRect.right))
            }

        // from the axis outward: the bands holding only this run, then the one it shares with its anchor row. A band
        // behind the viewport has every band beyond it behind the viewport too
        let remaining = crossed, kept = 0, withdrawn = 0, sharedBand = null

        for (let n = 0; (n < bandList.length) && remaining; n++) {

            const
                band = forward?bandList[bandList.length - 1 - n]:bandList[n],
                size = band.childElementCount

            if (size > remaining) {
                sharedBand = band
                break
            }

            if (withdrawn || isPassed(band)) withdrawn += size
            else kept += size

            remaining -= size

        }

        const behind = (sharedBand && (withdrawn || isPassed(sharedBand)))?remaining:0

        if (!withdrawn) return {withdrawn, behind}

        const start = forward?(portalIDList.length - run.length + remaining):(backwardCells + kept)

        removePlaceholderCells(portalIDList.slice(start, start + withdrawn))

        // the run has closed up: each placeholder left is told its place in it
        const map = placeholderState().map

        standingAt(direction).forEach((id, k) => {
            const entry = map.get(id)
            if (entry.index === k) return
            entry.index = k
            cellPortalListRef.current[portalIDListRef.current.indexOf(id)] = placeholderPortal(id, entry)
        })

        return {withdrawn, behind}

    }

    // places up to count placeholders at the end, within the cap there; answers the number placed. The cap bounds
    // what stands ahead of the viewport: behind is the count the fill found standing behind it and left in place
    const placeAt = (direction, referenceID, count, behind = 0) => {

        const
            cap = placeholderCap(),
            standing = standingAt(direction).length - behind,
            n = Math.min(count, cap - standing)

        if (n <= 0) return 0

        const packs = makePlaceholders(direction, n, referenceID)

        cellPortalListRef.current = (direction == 'forward')
            ? placeForward(packs, (id, entry) => placeholderPortal(id, entry))
            : placeBackward(packs, (id, entry) => placeholderPortal(id, entry))

        return n

    }

    // withdraws what the scroll has passed, fills the room at both ends with placeholders, within the caps, lets go
    // of an ask left with nothing standing at its end, and sends the next ask if none is out. An end the host has
    // closed (the quiet mark) takes none, and neither does an end the end state is asking again
    const fillWithPlaceholders = () => {

        const
            state = placeholderState(),
            passedForward = withdrawPassed('forward'),
            passedBackward = withdrawPassed('backward')

        let placed = 0

        const
            last = lastRealID(),
            first = firstRealID(),
            forwardStanding = standingAt('forward'),
            backwardStanding = standingAt('backward'),
            forwardAnchor = (last !== undefined)?last:(forwardStanding.length?state.map.get(forwardStanding[0]).referenceID:undefined),
            backwardAnchor = (first !== undefined)?first:(backwardStanding.length?state.map.get(backwardStanding[0]).referenceID:undefined)

        if (forwardAnchor !== undefined && !isQuietAt('forward') && !isEndAskAt('forward')) placed += placeAt('forward', forwardAnchor, forwardRoom(), passedForward.behind)
        if (backwardAnchor !== undefined && !isQuietAt('backward') && !isEndAskAt('backward')) placed += placeAt('backward', backwardAnchor, backwardRoom(), passedBackward.behind)

        if (placed || passedForward.withdrawn || passedBackward.withdrawn) {
            setPortalRenderList([...cellPortalListRef.current])
            updateCurrentAxisReferenceID()
        }

        // one fetch is out at a time, so an ask left with nothing standing at its end holds back the end that has
        // placeholders: it is let go. Read after the placing, so a run withdrawn and stood again on the same row keeps
        // its ask. The opening's ask is not read (no other ask brings the first rows), nor the end state's (it
        // stands none by design)
        if (state.pending && !state.pending.endAsk && (state.pending.startCode != 'at') && !standingAt(state.pending.direction).length) dropPending()

        if (!state.pending) sendNextAsk()

    }

    const getCellsWithPlaceholders = async (startCode, seedReferenceID) => {

        const state = placeholderState()

        if (startCode == 'at') {

            // the opening: the seed row and those after it take the cradle's forward room
            if (state.pending) dropPending()

            const
                count = Math.min(cradlePotentialRef.current.forwardCells, placeholderCap()),
                packs = makePlaceholders('forward', count, seedReferenceID)

            if (!count) return

            cellPortalListRef.current = placeForward(packs, (id, entry) => placeholderPortal(id, entry))
            setPortalRenderList(cellPortalListRef.current)
            updateCurrentAxisReferenceID()

            sendAsk('at', 'forward', seedReferenceID, packs.map((pack) => pack.id))

            return

        }

        fillWithPlaceholders()

    }

    // the forward end is asked first. An ask covers every placeholder standing at its end; an end the end state asks
    // again has none standing, and its ask is for the room there
    const sendNextAsk = () => {

        for (const direction of ['forward', 'backward']) {

            const
                ids = standingAt(direction),
                anchor = (direction == 'forward')?lastRealID():firstRealID()

            let room = null

            if (!ids.length) {

                if (!isEndAskAt(direction)) continue

                room = (anchor !== undefined)?roomAt(direction):0

                if (!room) {
                    placeholderState().endAsk[direction] = null
                    continue
                }

            }

            const referenceID = (anchor !== undefined)?anchor:placeholderState().map.get(ids[0]).referenceID

            sendAsk((direction == 'forward')?'after':'before', direction, referenceID, ids, room)

            return

        }

    }

    // roomAtEnd is given for the end state's ask alone: no placeholder stands for it, and it asks for that many
    const sendAsk = (startCode, direction, referenceID, ids, roomAtEnd = null) => {

        const
            state = placeholderState(),
            askID = ++state.askSerial

        ids.forEach((id, k) => {
            const entry = state.map.get(id)
            entry.askID = askID
            entry.index = k
        })

        state.pending = {
            startCode,
            direction,
            referenceID,
            count: roomAtEnd ?? ids.length,
            attempt: 0,
            controller: null,
            ceilingTimer: null,
            cradleActual: cradleActualRef.current,
            askID,
            endAsk: roomAtEnd !== null,
        }

        issueAsk(state.pending)

    }

    const issueAsk = (pending) => {

        pending.attempt++

        const
            attempt = pending.attempt,
            controller = pending.controller = new AbortController(),
            context = {attempt, signal: controller.signal}

        pending.ceilingTimer = setTimeout(() => onCeiling(pending, attempt), fetchCeilingRef.current)

        const call = async () => {
            try {
                return {ok: true, cells: await fetchCellsRef.current(pending.startCode, pending.referenceID, pending.count, context)}
            } catch (error) {
                return {ok: false, error}
            }
        }

        call().then((answer) => {

            if (controller.signal.aborted) return // dropped at the ceiling, by a let-go, a structural call, a reset or the unmount

            clearTimeout(pending.ceilingTimer)

            DOMManipulationQueueRef.current.enqueue(async () => {
                try {
                    // a scroll since the last task may have carried the viewport past the whole cradle, with the
                    // scroller's response to it still to run. The cradle is brought first and the run stood from
                    // there, so the rows fill under the viewport; an ask that fill lets go is answered late
                    if (bringOutrunCradleRef.current && bringOutrunCradleRef.current()) fillWithPlaceholders()
                    applyAnswer(pending, attempt, answer)
                } finally {
                    requestIntersectionsConnect()
                }
            }, 'fetchCells answer')
                .catch((error) => {
                    leadTailblockBandRef.current && reportError(callbacksRef, `fetchCells, ${pending.startCode}`, errorMessage(error),
                        [pending.startCode, pending.referenceID, pending.count])
                })

        })

    }

    const onCeiling = (pending, attempt) => {

        const state = placeholderState()

        if (state.pending !== pending || pending.attempt !== attempt) return

        if (!leadTailblockBandRef.current || cradleActualRef.current !== pending.cradleActual) {
            dropPending()
            return
        }

        pending.controller.abort()

        // the end state's ask is sent again for the room at its end, while its record stands
        const
            ids = standingAt(pending.direction),
            count = pending.endAsk?(isEndAskAt(pending.direction)?roomAt(pending.direction):0):ids.length

        if (!count) { // every position has been trimmed, or the end state's ask no longer stands; there is nothing to fill
            state.pending = null
            sendNextAsk()
            return
        }

        const
            source = `fetchCells, ${pending.startCode}`,
            message = `no answer within ${fetchCeilingRef.current} ms (technical.FETCH_CEILING); the same cells are asked for again`

        reportWarning(callbacksRef, source, message, [pending.startCode, pending.referenceID, pending.count], {attempt})

        ids.forEach((id, k) => { state.map.get(id).index = k })
        pending.count = count

        issueAsk(pending)

    }

    const dropPending = () => {

        const
            state = placeholderState(),
            pending = state.pending

        if (!pending) return

        clearTimeout(pending.ceilingTimer)
        pending.controller?.abort()
        state.pending = null

    }

    const isValidCellPack = (cellPack, source) => {

        const isInvalid = !(
            (cellPack !== null) &&
            (typeof cellPack == 'object') &&
            React.isValidElement(cellPack.component) &&
            isValidID(cellPack.id))

        if (isInvalid) {
            reportError(callbacksRef, source, 'cellPack must have valid id and component', [cellPack])
            return false
        }

        if (portalContainerMapRef.current.has(cellPack.id)) {
            reportError(callbacksRef, source, 'fetched cellPack is a duplicate', [cellPack])
            return false
        }

        return true

    }

    // rows answered at an end the end state asked again: nothing stood there to fill, so they are added at that end,
    // as many as the cradle has room for
    const addAtEnd = (direction, cells, source) => {

        const cellsBefore = portalIDListRef.current.length

        cells = cells.slice(0, roomAt(direction))

        cellPortalListRef.current = (direction == 'forward')?setForwardCells(cells, source):setBackwardCells(cells, source)

        return portalIDListRef.current.length - cellsBefore

    }

    const applyAnswer = (pending, attempt, answer) => {

        const state = placeholderState()

        if (state.pending !== pending || pending.attempt !== attempt) return

        if (!leadTailblockBandRef.current || cradleActualRef.current !== pending.cradleActual) {
            dropPending()
            return
        }

        state.pending = null

        const
            {startCode, direction, referenceID, count, endAsk} = pending,
            source = `fetchCells, ${startCode}`,
            args = [startCode, referenceID, count]

        // an answer to the end state's ask is taken only while that ask's record stands (the cradle and the end row
        // are as they were). Otherwise it is neither rows nor the end of the data, and that end is filled as any other
        const endAskStands = endAsk && isEndAskAt(direction)

        if (endAsk) state.endAsk[direction] = null

        if (endAsk && !endAskStands) {
            fillWithPlaceholders()
            return
        }

        if (!answer.ok) {
            reportError(callbacksRef, source, `fetchCells rejected: ${errorMessage(answer.error)}`, args, {attempt})
            withdrawRun(direction)
            return
        }

        let cells = answer.cells

        if (!Array.isArray(cells)) {
            reportError(callbacksRef, source, 'fetchCells must return an array of cellPacks', args, {return: cells})
            withdrawRun(direction)
            return
        }

        if (cells.length > count) {
            const excessIDList = cells.slice(count).map((cellPack) => cellPack?.id)
            cells = cells.slice(0, count)
            reportFailed(callbacksRef, source, 'too many cellPacks; excess not loaded', excessIDList)
        }

        if (!cells.length) { // the end of the data at this end
            endRun(direction, startCode)
            return
        }

        // a repeat within the batch is skipped and reported, as the inline path takes it; the rest still fill
        cells = dropRepeats(cells, source)

        if (!cells.every((cellPack) => isValidCellPack(cellPack, source))) {
            reportError(callbacksRef, source, 'one or more errors found in fetched cellPacks. Loading aborted', args, {return: cells})
            withdrawRun(direction)
            return
        }

        // either answer starts nearest the real rows: 'after' is REF+1, REF+2, …, and 'before' is REF-1, REF-2, …,
        // as the inline path takes them. Its rows fill the run as it stands now, nearest the rows first: a position
        // is counted from the row the ask named, whichever placeholder stood on it when the ask was sent, so the
        // rows stay in sequence though the scroll has withdrawn or trimmed placeholders and stood others since. A
        // short answer fills the nearest positions and leaves the far ones standing; a row past the run's end takes
        // nothing, and is asked for again if the cradle comes back to it. A run that no longer stands on the row
        // the ask named takes nothing: the answer's rows are not its positions'.
        // The end state's ask has no run: its rows are added at the end
        const
            ids = standingAt(direction),
            anchor = (direction == 'forward')?lastRealID():firstRealID(),
            runReferenceID = (anchor !== undefined)?anchor:state.map.get(ids[0])?.referenceID

        let placed = 0

        if (endAsk) placed = addAtEnd(direction, cells, source)
        else if (runReferenceID === referenceID) cells.forEach((cellPack, k) => {

            const id = ids[k]

            if (id === undefined) return

            fillInPlace(id, cellPack)
            placed++

        })

        reanchor(direction)

        // the trim a shift left behind an axis standing inside this run (trimCradle) is taken on the answer: an axis
        // still inside what is left of the run waits again. No ask is out, and the fill reads the room after it
        trimCradle()

        setPortalRenderList([...cellPortalListRef.current])
        updateCurrentAxisReferenceID()

        // rows at an end are not that end's end of the data: an end state standing there is left (useIntersections)
        if (placed) onRunEndedRef.current && onRunEndedRef.current(direction, 'rows')

        fillWithPlaceholders()

    }

    // the real row takes the placeholder's position and container; the portal is re-keyed to the row's id
    const fillInPlace = (placeholderID, cellPack) => {

        const
            portalIDList = portalIDListRef.current,
            index = portalIDList.indexOf(placeholderID),
            container = portalContainerMapRef.current.get(placeholderID),
            {id, component} = cellPack

        container.setAttribute('data-id', id)
        // the container is the row's from here: a spread size left on it would stand the row at the placeholder's
        clearPlaceholderSpread(container, orientationRef.current, layoutRef.current)

        portalIDList[index] = id
        cellDataListRef.current[index] = cellPack
        cellPortalListRef.current[index] = createPortal(component, container, id)

        portalContainerMapRef.current.delete(placeholderID)
        portalContainerMapRef.current.set(id, container)
        placeholderState().map.delete(placeholderID)

    }

    // the placeholders left standing at an end follow the real row they now stand beside
    const reanchor = (direction) => {

        const
            ids = standingAt(direction),
            anchor = (direction == 'forward')?lastRealID():firstRealID(),
            state = placeholderState()

        ids.forEach((id, k) => {
            const
                entry = state.map.get(id),
                index = portalIDListRef.current.indexOf(id)
            if (anchor !== undefined) entry.referenceID = anchor
            entry.index = k
            entry.askID = null
            cellPortalListRef.current[index] = placeholderPortal(id, entry)
        })

    }

    // an empty answer: the positions at that end are taken down, and the end state is told
    const endRun = (direction, startCode) => {

        removePlaceholderCells(standingAt(direction))

        trimCradle() // the run has answered: the trim it deferred, as applyAnswer takes it

        setPortalRenderList([...cellPortalListRef.current])

        if (!portalIDListRef.current.length) {

            // nothing at the seed: the axis stood on a placeholder, and there is no row to put it on
            if (currentAxisReferenceIDRef.current !== null) {
                currentAxisReferenceIDRef.current = null
                callbacksRef.current.axisReferenceID && callbacksRef.current.axisReferenceID(null)
            }

            return

        }

        updateCurrentAxisReferenceID()

        if (startCode != 'at') {
            onRunEndedRef.current && onRunEndedRef.current(direction, 'end')
            markQuiet(direction, 'end') // after the snap the entry may have made
        }

        // the room at the other end is filled and asked for: a cradle the trim cut to the anchor is under its potential
        // with nothing standing there, and the next ask alone sends only for what stands
        fillWithPlaceholders()

    }

    // a failed answer: the run is withdrawn, and the next scroll asks again. A viewport that had scrolled onto the
    // placeholders is brought back as on an empty answer: left past the last row, the overflow would be seen again
    // on the reconnect and ask again, once a frame, for as long as the scroll input is recent
    const withdrawRun = (direction) => {

        removePlaceholderCells(standingAt(direction))

        trimCradle() // the run has answered: the trim it deferred, as applyAnswer takes it

        setPortalRenderList([...cellPortalListRef.current])
        updateCurrentAxisReferenceID()
        onRunEndedRef.current && onRunEndedRef.current(direction, 'failed')
        markQuiet(direction, 'failed') // after the snap, as endRun marks

        fillWithPlaceholders()

    }

    // every standing placeholder goes, and the pending answer with it: a structural call is about to move rows
    const withdrawPlaceholders = () => {

        const state = placeholderState()

        dropPending()
        clearQuietMarks()

        if (!state.map.size) return false

        removePlaceholderCells([...state.map.keys()])

        setPortalRenderList([...cellPortalListRef.current])
        updateCurrentAxisReferenceID()

        return true

    }

    const removePlaceholderCells = (ids) => {

        const
            portalIDList = portalIDListRef.current,
            cellPortalList = cellPortalListRef.current,
            cellDataList = cellDataListRef.current,
            portalContainerMap = portalContainerMapRef.current,
            cradleActual = cradleActualRef.current,
            state = placeholderState()

        ids.forEach((id) => {

            const index = portalIDList.indexOf(id)

            if (index < 0) {
                state.map.delete(id)
                return
            }

            const inHead = index < cradleActual.backwardCells

            portalIDList.splice(index, 1)
            cellPortalList.splice(index, 1)
            cellDataList.splice(index, 1)

            portalContainerMap.get(id)?.remove()
            portalContainerMap.delete(id)
            state.map.delete(id)

            if (inHead) cradleActual.backwardCells--
            else cradleActual.forwardCells--

        })

        cradleActual.totalCells = cradleActual.backwardCells + cradleActual.forwardCells

        removeEmptyBands({
            headBandList: headBandListRef.current,
            tailBandList: tailBandListRef.current,
            leadHeadblockBand: leadHeadblockBandRef.current,
            leadTailblockBand: leadTailblockBandRef.current,
            cradleActual,
        })

    }

    // a fetch is open at an end while placeholders stand there, an ask for it is out, or the end state's ask for it
    // waits its turn
    const isFetchOpenAt = (end) => {

        const direction = (end == 'tail')?'forward':'backward'

        return !!standingAt(direction).length || (placeholderState().pending?.direction == direction) || isEndAskAt(direction)

    }

    // the host's placeholder component or context changed: every standing placeholder is drawn again
    const rebuildPlaceholderPortals = () => {

        const
            state = placeholderState(),
            portalIDList = portalIDListRef.current

        if (!state.map.size) return

        portalIDList.forEach((id, index) => {
            const entry = state.map.get(id)
            if (entry) cellPortalListRef.current[index] = placeholderPortal(id, entry)
        })

        setPortalRenderList([...cellPortalListRef.current])

    }

    // the cradle's real rows, and its placeholders, as the host reads them. quiet reads the end marks as isQuietAt
    // tests them, but never clears one: a report is a read, and a mark that no longer stands is the end state's to drop
    const placeholderReport = () => {

        const
            portalIDList = portalIDListRef.current,
            cradleActual = cradleActualRef.current,
            state = placeholderState(),
            map = state.map,
            quietReason = (direction) => {
                const mark = state.quiet[direction]
                return (mark && (mark.cradleActual === cradleActual) && (mark.endID === endID(direction)))?mark.reason:null
            }

        let forwardPlaceholders = 0, backwardPlaceholders = 0

        portalIDList.forEach((id, index) => {
            if (!map.has(id)) return
            if (index < cradleActual.backwardCells) backwardPlaceholders++
            else forwardPlaceholders++
        })

        const
            firstID = portalIDList[0],
            lastID = portalIDList.at(-1)

        return {
            forwardPlaceholders,
            backwardPlaceholders,
            firstPlaceholderReferenceID: map.has(firstID)?firstID:null,
            lastPlaceholderReferenceID: map.has(lastID)?lastID:null,
            firstRealReferenceID: firstRealID(),
            lastRealReferenceID: lastRealID(),
            quiet: { forward: quietReason('forward'), backward: quietReason('backward') },
        }

    }

    // =========================[ placement into the cradle ]=========================

    // The checks in setForwardCells and setBackwardCells catch an id the cradle already holds, not one the
    // batch itself repeats. A repeat is reported and skipped, and the rest of the batch loads.
    const dropRepeats = (newCells, source) => {

        const seen = new Set()

        return newCells.filter((cellPack) => {

            const id = cellPack?.id

            if (!isValidID(id)) return true // reported by the checks that follow

            if (!seen.has(id)) {
                seen.add(id)
                return true
            }

            reportError(callbacksRef, source,
                'duplicate id within the batch; the repeat is skipped', [cellPack], {return: newCells})

            return false

        })

    }

    const validateCells = (newCells, source) => {

        return newCells.every((cellPack)=>{ // if any errors found then abort loading

            const isInvalid = (!(
                (cellPack !== null) &&
                (typeof cellPack == 'object') &&
                React.isValidElement(cellPack.component) &&
                isValidID(cellPack.id)))

            if (isInvalid) reportError(callbacksRef, source, 'cellPack must have valid id and component', [cellPack])

            let isDuplicate = false
            if (!isInvalid) {
                isDuplicate = portalContainerMapRef.current.has(cellPack.id)
                if (isDuplicate) reportError(callbacksRef, source, 'fetched cellPack is a duplicate', [cellPack])
            }

            return (!isDuplicate && !isInvalid)
        })

    }

    const setForwardCells = (newCells, source = 'fetchCells, after') => {

        newCells = dropRepeats(newCells, source)

        if (!validateCells(newCells, source)) return cellPortalListRef.current

        return placeForward(newCells, (id, cellPack) => createPortal(cellPack.component, portalContainerMapRef.current.get(id), id))

    }

    const setBackwardCells = (newCells, source = 'fetchCells, before') => {

        newCells = dropRepeats(newCells, source)

        if (!validateCells(newCells, source)) return cellPortalListRef.current

        return placeBackward(newCells, (id, cellPack) => createPortal(cellPack.component, portalContainerMapRef.current.get(id), id))

    }

    // each item is {id, ...}: a cellPack, or a placeholder's {id, entry}. makePortal is called once the
    // container is registered, so a portal can be made for either
    const placeForward = (newCells, makePortal) => {

        const
            incomingPortalList = [],
            cellPortalList = cellPortalListRef.current,
            cradleActual = cradleActualRef.current

        newCells.forEach((item) => {

            // register cell data
            cellDataListRef.current.push(item)
            const {id} = item
            portalIDListRef.current.push(id)
            const container = createContainer(id, cellDimensionsRef.current, cradleActual.cellsPerBand,
                orientationRef.current,layoutRef.current)
            if (item.entry) setPlaceholderSpread(container, cellDimensionsRef.current, orientationRef.current, layoutRef.current, placeholderSpreadRatio())
            portalContainerMapRef.current.set(id, container)
            incomingPortalList.push(makePortal(id, item.entry ?? item))

            // allocate cell data
            let band
            const latestband = tailBandListRef.current.at(-1)

            if (!latestband) {
                // a shift that took every tail band can leave the head's last band partial; it is the cradle's last
                // band, so the room in it is taken before a new band is opened, or the partial band is left mid-cradle
                const lastband = headBandListRef.current.at(-1)
                if (lastband && lastband.childElementCount < cradleActual.cellsPerBand) {
                    band = lastband
                    band.append(container)
                    cradleActual.backwardCells++
                    cradleActual.totalCells++
                    return
                }
            }

            if (latestband && latestband.childElementCount < cradleActual.cellsPerBand) {

                band = latestband

            } else {

                band = createBand(orientationRef.current, layoutRef.current, cradleActual.cellsPerBand,
                    spacingRef.current, bandMutationObserverRef.current)

                if (tailBandListRef.current.length == 0) {

                    leadTailblockBandRef.current.append(band)

                } else {

                    tailblockRef.current.append(band)

                }

                tailBandListRef.current.push(band)
                cradleActual.totalBands++
                cradleActual.forwardBands++
            }

            band.append(container)
            cradleActual.forwardCells++
            cradleActual.totalCells++

        })

        return cellPortalList.concat(incomingPortalList)

    }

    const placeBackward = (newCells, makePortal) => {

        const
            incomingPortalList = [],
            cellPortalList = cellPortalListRef.current,
            cradleActual = cradleActualRef.current

        newCells.forEach((item) => {

            // register cell data
            cellDataListRef.current.unshift(item)
            const {id} = item
            portalIDListRef.current.unshift(id)

            const container = createContainer(id, cellDimensionsRef.current, cradleActualRef.current.cellsPerBand,
                orientationRef.current, layoutRef.current)
            if (item.entry) setPlaceholderSpread(container, cellDimensionsRef.current, orientationRef.current, layoutRef.current, placeholderSpreadRatio())

            portalContainerMapRef.current.set(id, container)
            incomingPortalList.unshift(makePortal(id, item.entry ?? item))

            // allocate cell data
            let band
            const latestband = headBandListRef.current[0]

            if (!latestband) {
                const firstband = tailBandListRef.current[0] // there may be room in the tail firstband
                if (firstband && firstband.childElementCount < cradleActual.cellsPerBand) {
                    band = firstband
                    band.prepend(container)
                    cradleActual.forwardCells++
                    cradleActual.totalCells++
                    return
                }
            }

            if (latestband && (latestband.childElementCount < cradleActual.cellsPerBand)) {

                band = latestband

            } else {

                band = createBand(orientationRef.current, layoutRef.current, cradleActual.cellsPerBand,
                    spacingRef.current, bandMutationObserverRef.current)

                if (headBandListRef.current.length == 0) {

                    leadHeadblockBandRef.current.append(band)

                } else {

                    headblockRef.current.prepend(band)

                }

                headBandListRef.current.unshift(band)
                cradleActual.totalBands++
                cradleActual.backwardBands++
            }

            band.prepend(container)
            cradleActual.backwardCells++
            cradleActual.totalCells++

        })

        return incomingPortalList.concat(cellPortalList)

    }

    // the unmount: the fetch out, by either path, is told
    const abortFetches = () => {
        dropPending()
        placeholderState().inlineController?.abort()
    }

    // a reset: the cradle is about to be emptied, so the registry goes with it, and a new generation names the next
    const clearPlaceholders = () => {
        const state = placeholderState()
        abortFetches()
        clearQuietMarks()
        state.map.clear()
        state.generation++
    }

    return {
        getCells,
        withdrawPlaceholders,
        abortFetches,
        clearPlaceholders,
        isFetchOpenAt,
        isEndFixed,
        markQuiet,
        isQuietAt,
        clearQuietMarks,
        clearQuietAt,
        isEndAskAt,
        endIndicatorComponentType,
        runAnchorIndex,
        rebuildPlaceholderPortals,
        placeholderReport,
    }

}

export default useCells
