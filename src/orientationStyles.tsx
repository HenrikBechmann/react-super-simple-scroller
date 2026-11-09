// orientationStyles.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import  { CSSProperties } from 'react'

const SCROLLBLOCK_SPAN = 1000000

// technicals
export { SCROLLBLOCK_SPAN }

// --- trigger geometry, one for both orientations

// how far into its band the forward trigger stands: the viewport travels this far past the band's start before a
// forward shift, and about as far back before the backward trigger (at the band's edge) shifts it back, so it is the
// dead band that keeps a small reversal from shifting a band out and in again
const FORWARD_TRIGGER_INSET = 5

// thicker than the 1 px edge triggers: a 1 px trigger at a fractional scroll position could read as past the
// viewport's start before the viewport had reached it (thickened from 1 with the fresh reset's 1 px axis offset)
const FORWARD_TRIGGER_THICKNESS = 3

// the tail overflow trigger stands this far past the tail block's end: the tail is asked for more once the viewport
// reaches a few px beyond its last row, not while it rests on that row's edge
const TAIL_OVERFLOW_TRIGGER_OFFSET = 4

// --- viewport styles

// overscroll is contained on the axis the scroller scrolls along: a scroll that reaches the end of the list
// stops there, and that containment is what holds the list at an end of its data (see useIntersections).
// on the other axis a gesture goes through to whatever scrolls behind the list, unless the host sets
// operations.crossAxisChaining to false. overflow stays 'auto' in every variant: a hold writes
// viewport.style.overflow directly, and React leaves a property alone when a style object swap does not change it
const baseViewportStyles = {
    position:'absolute',
    inset:0,
    overflow:'auto',
    scrollbarWidth:'none',
    overflowAnchor:'none',
} as CSSProperties

const verticalViewportStyles = {
    ...baseViewportStyles,
    overscrollBehaviorX:'auto',
    overscrollBehaviorY:'none',
} as CSSProperties

const horizontalViewportStyles = {
    ...baseViewportStyles,
    overscrollBehaviorX:'none',
    overscrollBehaviorY:'auto',
} as CSSProperties

const containedViewportStyles = {
    ...baseViewportStyles,
    overscrollBehaviorX:'none',
    overscrollBehaviorY:'none',
} as CSSProperties

export const selectViewportStyles = (orientation, crossAxisChaining) => {

    if (crossAxisChaining === false) return containedViewportStyles

    return (orientation == 'vertical')
        ? verticalViewportStyles
        : horizontalViewportStyles

}

// --- vertical styles

const verticalScrollblockStyles = {
    height: SCROLLBLOCK_SPAN + 'px',
    width: '100%',
    position: 'relative',
} as CSSProperties

const verticalAxisStyles = {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 0,
    width: '100%',
} as CSSProperties

const verticalHeadblockStyles = { 
    zIndex:0,
    position: 'absolute',
    left:0,
    bottom: 0,
    width:'fit-content',
    minWidth: '100%',
    display: 'flex',
    flexDirection: 'column',
} as CSSProperties

const verticalHeadblockOverflowTriggerStyles = { // observed for head overflow
    zIndex: -1,
    position: 'absolute',
    top: 0,
    left:0,
    height: '1px',
    width: '100%',
} as CSSProperties

const verticalLeadHeadblockBandStyles = { // observed for intersection
    zIndex:0,
    position: 'relative',
    minHeight: '1px',
    minWidth: '100%',
} as CSSProperties

const verticalLeadHeadblockBandBackwardTriggerStyles = { // observed for shift backward
    zIndex: -1,
    position: 'absolute',
    top: 0,
    left: 0,
    height: '1px',
    width: '100%',
} as CSSProperties

const verticalTailblockStyles = {
    zIndex:0,
    position: 'absolute',
    top: 0,
    left:0,
    width:'fit-content',
    minWidth: '100%',
    display:'flex',
    flexDirection:'column',
} as CSSProperties

const verticalTailblockOverflowTriggerStyles = { // observed for tail overflow
    zIndex: -1,
    position: 'absolute',
    bottom: -TAIL_OVERFLOW_TRIGGER_OFFSET,
    right:0,
    height: '1px',
    width: '100%',
} as CSSProperties

const verticalLeadTailblockBandStyles = { // observed for intersection
    zIndex:0,
    position: 'relative',
    minHeight: '1px',
    minWidth: '100%',
} as CSSProperties

const verticalLeadTailblockBandForwardTriggerStyles = { // observed for shift forward
    zIndex: -1,
    position: 'absolute',
    top: FORWARD_TRIGGER_INSET,
    right:0,
    height: FORWARD_TRIGGER_THICKNESS,
    width: '100%',
} as CSSProperties

const verticalLeadTailblockBandEndTriggerStyles = { // observed as mirror of LeadHeadblockBandBackwardTrigger
    zIndex:-1,
    position: 'absolute',
    bottom:0,
    right:0,
    height: '1px',
    width: '100%',
} as CSSProperties

// --- horizontal styles

const horizontalScrollblockStyles = {
    width: SCROLLBLOCK_SPAN + 'px',
    height: '100%',
    position: 'relative',
} as CSSProperties

const horizontalAxisStyles = {
    position: 'absolute',
    left: 0,
    top: 0,// bottom: 0,
    width: 0,
    height: '100%',
} as CSSProperties

const horizontalHeadblockStyles = { 
    zIndex: 0,
    position: 'absolute',
    top: 0,// bottom: 0,
    right:0,
    height:'fit-content',
    minHeight: '100%',
    display:'flex',
    flexDirection:'row',
} as CSSProperties

const horizontalHeadblockOverflowTriggerStyles = { // observed for head overflow
    zIndex: -1,
    position: 'absolute',
    left:0,
    top: 0,// bottom:0,
    height: '100%',
    width: '1px',
} as CSSProperties

const horizontalLeadHeadblockBandStyles = { // observed for intersection
    zIndex: 0,
    position: 'relative',
    minWidth: '1px',
    minHeight:'100%',
} as CSSProperties

const horizontalLeadHeadblockBandBackwardTriggerStyles = { // observed for backward shift
    zIndex: -1,
    position: 'absolute',
    left:0,
    top: 0, // bottom: 0,
    height: '100%',
    width: '1px',
} as CSSProperties

const horizontalTailblockStyles = {
    zIndex: 0,
    position: 'absolute',
    left:0,
    top: 0, // bottom: 0,
    height: 'fit-content',
    minHeight: '100%',
    display:'flex',
    flexDirection:'row',
} as CSSProperties

const horizontalTailblockOverflowTriggerStyles = { // observed for tail overflow
    zIndex: -1,
    position: 'absolute',
    right: -TAIL_OVERFLOW_TRIGGER_OFFSET,
    top:0,
    height: '100%',
    width: '1px',
} as CSSProperties

const horizontalLeadTailblockBandStyles = { // observed for intersection
    zIndex: 0,
    position: 'relative',
    minWidth: '1px',
    minHeight: '100%',
} as CSSProperties

const horizontalLeadTailblockBandForwardTriggerStyles = { // observed for forward shift
    zIndex: -1,
    position: 'absolute',
    top: 0,
    left: FORWARD_TRIGGER_INSET,
    height: '100%',
    width: FORWARD_TRIGGER_THICKNESS,
} as CSSProperties

const horizontalLeadTailblockBandEndTriggerStyles = { // observed as mirror of leadHeadblockBandBackwardTrigger
    zIndex: -1,
    position: 'absolute',
    top: 0,
    right:0,
    height: '100%',
    width: '1px',
} as CSSProperties

export const selectStyles = (orientation) => {

    // const [cradleMarginStart, cradleMarginEnd] = cradleMargins

    let styles
    if (orientation == 'vertical') {

        styles = {
            scrollblockStyles: verticalScrollblockStyles,
            axisStyles: verticalAxisStyles,

            headblockStyles: verticalHeadblockStyles,
            leadHeadblockBandStyles: verticalLeadHeadblockBandStyles,
            headblockOverflowTriggerStyles: verticalHeadblockOverflowTriggerStyles,            
            leadHeadblockBandBackwardTriggerStyles: verticalLeadHeadblockBandBackwardTriggerStyles,

            tailblockStyles: verticalTailblockStyles,
            leadTailblockBandStyles: verticalLeadTailblockBandStyles,
            tailblockOverflowTriggerStyles: verticalTailblockOverflowTriggerStyles,
            leadTailblockBandForwardTriggerStyles: verticalLeadTailblockBandForwardTriggerStyles,
            leadTailblockBandEndTriggerStyles: verticalLeadTailblockBandEndTriggerStyles,

        }
    } else { // horizontal

        styles = {
            scrollblockStyles: horizontalScrollblockStyles,
            axisStyles: horizontalAxisStyles,

            headblockStyles: horizontalHeadblockStyles,
            leadHeadblockBandStyles: horizontalLeadHeadblockBandStyles,
            headblockOverflowTriggerStyles: horizontalHeadblockOverflowTriggerStyles,            
            leadHeadblockBandBackwardTriggerStyles: horizontalLeadHeadblockBandBackwardTriggerStyles,

            tailblockStyles: horizontalTailblockStyles,
            leadTailblockBandStyles: horizontalLeadTailblockBandStyles,
            tailblockOverflowTriggerStyles: horizontalTailblockOverflowTriggerStyles,
            leadTailblockBandForwardTriggerStyles: horizontalLeadTailblockBandForwardTriggerStyles,
            leadTailblockBandEndTriggerStyles: horizontalLeadTailblockBandEndTriggerStyles,

        }
    }
    return styles
}
