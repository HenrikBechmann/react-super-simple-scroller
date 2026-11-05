// useCells.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import React from 'react'
import { createPortal } from 'react-dom'

import { createBand, createContainer, removeEmptyBands, isValidID, reportError, reportFailed, reportWarning, errorMessage } from './utilities'
import { DefaultPlaceholder, placeholderID } from './placeholders'

// Two ways to grow the cradle, chosen by operations.placeholderCap.
//
// With the cap at 0 the host's fetch is awaited where the fill runs: the cradle grows when the answer comes, and
// nothing shows in the meantime (getCellsInline).
//
// With a cap above 0 a fill first places placeholder cells in the positions it would ask for, up to the cap at each
// end and within the cradle's room there, so the list grows at once and the layout holds while the host answers.
// One fetch is out at a time. It is asked for the last real row's id (the first, backward) and the count of the
// placeholders standing at that end, and its answer fills them by position: item k fills the placeholder that was
// k-th from the real rows when the ask was sent, in place, in the one container, so a fill moves nothing. A short
// answer leaves the rest standing, re-anchored on the new last real row for the next ask; an empty answer is the
// end of the data at that end and takes the rest down. Positions that open while a fetch is out get placeholders
// and wait for the next ask. A fetch unanswered within technical.FETCH_CEILING is dropped, its signal fired, and
// the same positions asked for again, once per ceiling, for as long as they stand. A structural call, a reset or
// the unmount withdraws the standing placeholders and drops the pending answer.
const useCells = ({

    scrollerName,

    DOMManipulationQueueRef,

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
    updateCurrentAxisReferenceID,
    currentAxisReferenceIDRef,
    callbacksRef,
    bandMutationObserverRef,
    requestIntersectionsConnect,

}) => {

    const
        placeholderState = () => placeholdersRef.current,
        badOptionsReported = new Set()

    // an option that cannot be used is reported once per value, and the default stands in for it
    const reportBadOption = (name, value, message) => {
        if (badOptionsReported.has(value)) return
        badOptionsReported.add(value)
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

    const placeholderComponentType = () => {

        const Component = operationsRef.current?.placeholder

        if (Component === undefined || Component === null) return DefaultPlaceholder

        if (typeof Component == 'function' || (typeof Component == 'object')) return Component

        reportBadOption('operations.placeholder', Component, 'must be a component; the default placeholder is used')

        return DefaultPlaceholder

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

            let moreExpected = true
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

            let moreExpected = true
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

                    // the head's end of the data, as the host answered it: the handler that takes the end hold hears
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

    const endID = (direction) => (direction == 'forward')?portalIDListRef.current.at(-1):portalIDListRef.current[0]

    // the one end memory: the host's last answer at this end closed the run, with nothing (end) or with a failure.
    // The hold reads it too (useIntersections marks through it). It carries no scroll position: the hold's own snap
    // moves the viewport with no input, and a mark keyed on the position dropped on every shift and asked again
    const markQuiet = (direction, reason) => {

        return placeholderState().quiet[direction] = {
            reason,
            cradleActual: cradleActualRef.current,
            endID: endID(direction),
        }

    }

    // the mark stands until input reaches its end (clearQuietAt), a structural call or a reset (clearQuietMarks), a new
    // cradle, or a change of the cell at that end; it is cleared when read otherwise. A reader that keeps the mark it
    // was given (the hold) asks whether the end is still as that mark had it, the same cell on the same cradle: an
    // answer that marks the end again after rows arrived or a reset is a later answer, and an answer that marks it as
    // it was is the same one
    const isQuietAt = (direction, asMarked = undefined) => {

        const
            state = placeholderState(),
            mark = state.quiet[direction]

        if (!mark) return false

        const stands = (mark.cradleActual === cradleActualRef.current) && (mark.endID === endID(direction))

        if (!stands) state.quiet[direction] = null

        return stands && ((asMarked === undefined) || ((mark.cradleActual === asMarked.cradleActual) && (mark.endID === asMarked.endID)))

    }

    const clearQuietMarks = () => {
        const state = placeholderState()
        state.quiet.forward = null
        state.quiet.backward = null
    }

    // a scroll into an end asks there again, whatever the hold at that end did to the scroll position
    const clearQuietAt = (end) => {
        placeholderState().quiet[(end == 'tail')?'forward':'backward'] = null
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

    // places up to count placeholders at the end, within the cap there; answers the number placed
    const placeAt = (direction, referenceID, count) => {

        const
            cap = placeholderCap(),
            standing = standingAt(direction).length,
            n = Math.min(count, cap - standing)

        if (n <= 0) return 0

        const packs = makePlaceholders(direction, n, referenceID)

        cellPortalListRef.current = (direction == 'forward')
            ? placeForward(packs, (id, entry) => placeholderPortal(id, entry))
            : placeBackward(packs, (id, entry) => placeholderPortal(id, entry))

        return n

    }

    // fills the room at both ends with placeholders, within the caps, and sends the next ask if none is out
    const fillWithPlaceholders = () => {

        const state = placeholderState()

        let placed = 0

        const
            last = lastRealID(),
            first = firstRealID(),
            forwardStanding = standingAt('forward'),
            backwardStanding = standingAt('backward'),
            forwardAnchor = (last !== undefined)?last:(forwardStanding.length?state.map.get(forwardStanding[0]).referenceID:undefined),
            backwardAnchor = (first !== undefined)?first:(backwardStanding.length?state.map.get(backwardStanding[0]).referenceID:undefined)

        if (forwardAnchor !== undefined && !isQuietAt('forward')) placed += placeAt('forward', forwardAnchor, forwardRoom())
        if (backwardAnchor !== undefined && !isQuietAt('backward')) placed += placeAt('backward', backwardAnchor, backwardRoom())

        if (placed) {
            setPortalRenderList(cellPortalListRef.current)
            updateCurrentAxisReferenceID()
        }

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

    // the forward end is asked first; an ask covers every placeholder standing at its end
    const sendNextAsk = () => {

        for (const direction of ['forward', 'backward']) {

            const ids = standingAt(direction)

            if (!ids.length) continue

            const
                anchor = (direction == 'forward')?lastRealID():firstRealID(),
                referenceID = (anchor !== undefined)?anchor:placeholderState().map.get(ids[0]).referenceID

            sendAsk((direction == 'forward')?'after':'before', direction, referenceID, ids)

            return

        }

    }

    const sendAsk = (startCode, direction, referenceID, ids) => {

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
            count: ids.length,
            attempt: 0,
            controller: null,
            ceilingTimer: null,
            cradleActual: cradleActualRef.current,
            askID,
            ids,
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

            if (controller.signal.aborted) return // dropped at the ceiling, by a structural call, a reset or the unmount

            clearTimeout(pending.ceilingTimer)

            DOMManipulationQueueRef.current.enqueue(async () => {
                try {
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

        const ids = standingAt(pending.direction)

        if (!ids.length) { // every position has been trimmed; there is nothing to fill
            state.pending = null
            sendNextAsk()
            return
        }

        const
            source = `fetchCells, ${pending.startCode}`,
            message = `no answer within ${fetchCeilingRef.current} ms (technical.FETCH_CEILING); the same cells are asked for again`

        reportWarning(callbacksRef, source, message, [pending.startCode, pending.referenceID, pending.count], {attempt})

        ids.forEach((id, k) => { state.map.get(id).index = k })
        pending.ids = ids
        pending.count = ids.length

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

    const applyAnswer = (pending, attempt, answer) => {

        const state = placeholderState()

        if (state.pending !== pending || pending.attempt !== attempt) return

        if (!leadTailblockBandRef.current || cradleActualRef.current !== pending.cradleActual) {
            dropPending()
            return
        }

        state.pending = null

        const
            {startCode, direction, referenceID, count} = pending,
            source = `fetchCells, ${startCode}`,
            args = [startCode, referenceID, count]

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
        // as the inline path takes them. A short answer fills the nearest positions and leaves the far ones standing.
        // A position trimmed while the ask was out takes nothing: the scroll has moved past it, and the row is
        // asked for again if the cradle comes back to it
        cells.forEach((cellPack, k) => {

            const id = pending.ids[k]

            if (id === undefined || !state.map.has(id)) return

            fillInPlace(id, cellPack)

        })

        reanchor(direction)

        setPortalRenderList([...cellPortalListRef.current])
        updateCurrentAxisReferenceID()

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

    // an empty answer: the positions at that end are taken down, and the hold, if one is in force, is told
    const endRun = (direction, startCode) => {

        removePlaceholderCells(standingAt(direction))

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
            markQuiet(direction, 'end') // after the snap the host of the hold may have made
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

    // a fetch is open at an end while placeholders stand there or an ask for it is out
    const isFetchOpenAt = (end) => {

        const direction = (end == 'tail')?'forward':'backward'

        return !!standingAt(direction).length || (placeholderState().pending?.direction == direction)

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

    // the cradle's real rows, and its placeholders, as the host reads them
    const placeholderReport = () => {

        const
            portalIDList = portalIDListRef.current,
            cradleActual = cradleActualRef.current,
            map = placeholderState().map

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
            portalContainerMapRef.current.set(id, container)
            incomingPortalList.push(makePortal(id, item.entry ?? item))

            // allocate cell data
            let band
            const latestband = tailBandListRef.current.at(-1)

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
        markQuiet,
        isQuietAt,
        clearQuietMarks,
        clearQuietAt,
        runAnchorIndex,
        rebuildPlaceholderPortals,
        placeholderReport,
    }

}

export default useCells
