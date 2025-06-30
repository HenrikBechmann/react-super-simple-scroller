// orientationStyles.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

import  { CSSProperties } from 'react'

const SCROLLBLOCK_SPAN = 1000000

// technicals
export { SCROLLBLOCK_SPAN }

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
    bottom: '-4px', // PIXEL
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
    top:'5px',
    right:0,
    height: '1px',
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
    right: '-4px',
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
    left:0,
    height: '100%',
    width: '1px',
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
