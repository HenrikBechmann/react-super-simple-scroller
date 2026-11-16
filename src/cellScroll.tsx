// cellScroll.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import { isPlaceholderID } from './placeholders'

// A browser drops the scroll offsets of an element that is moved to another parent, and of everything under it. A
// cell's frame is moved whenever its cell crosses the axis, so the scroller keeps what has scrolled inside each frame
// and puts it back when the frame lands (operations.restoreCellScroll).
//
// The record is held by frame: frame -> Map(element -> {top, left}), with null in place of the offsets for the
// viewport of a scroller nested in the cell, which holds its own position and is asked to restore it. A frame that
// lands with nothing scrolled in it costs one lookup, and no cell's subtree is ever walked; a record goes when its
// frame does.

const VIEWPORT = '[data-type="viewport"]', FRAME = '[data-type="portal-container"]'

export const createCellScrollState = () => new WeakMap()

// Given the target of every scroll event that passes through the scroller's viewport on its way down (scroll does
// not bubble, so the listener is a capturing one). The viewport's own scroll is the list's, not a cell's, and is
// left at once. An element belongs to the nearest viewport above it: a scroller nested in a cell records its own
// cells' content, and its viewport is the outer scroller's to record. A placeholder is the scroller's own cell, and
// the row that takes its frame starts with no record
export const recordCellScroll = (cellScrolls, viewport, target) => {

    if (target === viewport) return
    if (target.parentElement?.closest(VIEWPORT) !== viewport) return

    const frame = target.closest(FRAME)
    if (!frame || isPlaceholderID(frame.getAttribute('data-id'))) return

    let scrolled = cellScrolls.get(frame)
    if (!scrolled) cellScrolls.set(frame, scrolled = new Map())

    // an element the cell has since dropped is let go as a new one is taken
    if (!scrolled.has(target)) {
        scrolled.forEach((offsets, element) => {
            frame.contains(element) || scrolled.delete(element)
        })
    }

    scrolled.set(target, target.matches(VIEWPORT) ? null : {top: target.scrollTop, left: target.scrollLeft})

}

// puts back what had scrolled inside a frame that has landed. Only an offset that differs is written, so a frame
// that was not moved is read and left
export const restoreCellScroll = (cellScrolls, frame) => {

    const scrolled = cellScrolls.get(frame)
    if (!scrolled) return

    scrolled.forEach((offsets, element) => {

        if (!frame.contains(element)) {
            scrolled.delete(element)
            return
        }

        if (offsets === null) {
            element.dispatchEvent(new Event('rs3restore'))
            return
        }

        if (element.scrollTop != offsets.top) element.scrollTop = offsets.top
        if (element.scrollLeft != offsets.left) element.scrollLeft = offsets.left

    })

}
