// endMachine.tsx
// copyright (c) 2025-present Henrik Bechmann, Toronto, Licence: MIT

// The end state of a list, declared as one record with one writer.
//
// Each end of the data is in one of four states (EndRegion): 'away' (nothing is known of the data's end there),
// 'known' (the host answered empty there, or failed to answer, and the viewport has not reached it), 'standing' (the
// viewport has reached the known end, and the list is stabilized on a mark there) and 'asking' (a gesture past the
// mark has asked the host again). The viewport does at most one thing at an end (EndActivity): 'past' (it stands past
// the mark, with the gesture's clock running or an elastic stretch out), 'returning' (it is being brought back to the
// mark, by a glide of the scroll position or a slide of the axis) or 'held' (scrolling is held there).
//
// The tie between the two: an activity belongs to an end that is standing or asking; a hold and a slide need it
// standing; an end that leaves standing or asking ends the activity it owns.
//
// The record is replaced, never edited. stepEndMachine is a pure function of a state and an event: it reads no clock
// and no DOM, and it returns the state it was given where the event changes nothing. The writer's tell is the one
// place the record is assigned, and it does not wait.
//
// The declaration runs beside the fields the scroller acts on (the end state and the hold in useIntersections, the
// fill's end memory in useCells): each of their writes is told here as the event that causes it, and nothing in the
// scroller reads the record.

export type End = 'head' | 'tail'

export type EndReason = 'end' | 'failed'

export type EndRegion =
    | { at: 'away' }
    | { at: 'known', why: EndReason }
    | { at: 'standing', mark: number, why: EndReason }
    | { at: 'asking', mark: number, why: EndReason }

export type EndActivity =
    | { at: 'idle' }
    | { at: 'past', end: End, clock: boolean, travel: number, drawn: number }
    | { at: 'returning', end: End, way: 'glide' | 'slide', target: number | null }
    | { at: 'held', end: End }

export type EndMachineState = { head: EndRegion, tail: EndRegion, activity: EndActivity }

// An event carries what its site has read and the record cannot know: a mark, a reason, whether input is recent,
// whether a finger is down. Two events are told in parts, because the scroller reads their parts in separate places.
// 'scrolled' is a reading of the viewport against an end's mark: whether it stands past the mark and the gesture's
// clock is running ('clock'), the elastic stretch ('stretch'), or an arrival that holds the scrolling at a fixed end
// ('arrival'). 'gestureEnded' is the clock running out ('clock', which asks an open end again and decides the return)
// and the return starting ('return').
export type EndEvent =
    | { type: 'runEnded', end: End, reason: EndReason }
    | { type: 'arrived', end: End, mark: number, enters: boolean, inputRecent: boolean }
    | { type: 'scrolled', end: End, read: 'clock', mark: number, past: boolean, armed: boolean }
    | { type: 'scrolled', end: End, read: 'stretch', travel: number, drawn: number }
    | { type: 'scrolled', end: End, read: 'arrival' }
    | { type: 'input', way: 'glide' | 'slide' }
    | { type: 'gestureEnded', end: End, part: 'clock', ask: boolean, finger: boolean }
    | { type: 'gestureEnded', end: End, part: 'return', way: 'glide' | 'slide', target: number }
    | { type: 'answered', end: End, outcome: 'rows' | 'none' | 'failed' }
    | { type: 'invalidated', end: End }
    | { type: 'returned', way: 'glide' | 'slide' }
    | { type: 'holdReleased' }
    | { type: 'resized', end: End, mark: number }
    | { type: 'shifted', delta: number }

const AWAY: EndRegion = { at: 'away' }

const IDLE: EndActivity = { at: 'idle' }

export const END_MACHINE_INITIAL: EndMachineState = { head: AWAY, tail: AWAY, activity: IDLE }

const ownsActivity = (region: EndRegion) => (region.at == 'standing') || (region.at == 'asking')

// the tie: what is left of an activity once its end has moved
const tieActivity = (head: EndRegion, tail: EndRegion, activity: EndActivity): EndActivity => {

    if (activity.at == 'idle') return activity

    const region = (activity.end == 'head') ? head : tail

    if (!ownsActivity(region)) return IDLE

    const needsStanding = (activity.at == 'held') || ((activity.at == 'returning') && (activity.way == 'slide'))

    return (needsStanding && (region.at != 'standing')) ? IDLE : activity

}

// a standing or asking end on a mark of its own: the same record where the mark has not moved
const markedAt = (region: EndRegion, mark: number): EndRegion =>
    (!ownsActivity(region) || ((region as any).mark === mark)) ? region : { ...region, mark } as EndRegion

// the clock of a gesture past an end has stopped: what is left is the stretch, or nothing
const clockStopped = (activity: EndActivity, end: End): EndActivity => {

    if ((activity.at != 'past') || (activity.end != end) || !activity.clock) return activity

    return (activity.travel || activity.drawn) ? { ...activity, clock: false } : IDLE

}

export const stepEndMachine = (state: EndMachineState, event: EndEvent): EndMachineState => {

    let { head, tail, activity } = state

    const
        regionAt = (end: End) => (end == 'head') ? head : tail,
        setRegion = (end: End, region: EndRegion) => {
            if (end == 'head') head = region
            else tail = region
        }

    switch (event.type) {

        // the fill's end memory is set at this end: the host answered empty there, or failed to answer
        case 'runEnded': {

            const { end, reason } = event, region = regionAt(end)

            if (region.at == 'away') setRegion(end, { at: 'known', why: reason })
            else if (region.at == 'asking') setRegion(end, { at: 'standing', mark: region.mark, why: reason })
            else if (region.why != reason) setRegion(end, { ...region, why: reason })

            break

        }

        // the viewport is at an end whose data has ended. An entry (enters) takes the hold where one stands or
        // input is recent, unless a glide is out; an end found on a mark it kept takes nothing
        case 'arrived': {

            const { end, mark, enters, inputRecent } = event, region = regionAt(end)

            if (region.at == 'away') setRegion(end, { at: 'standing', mark, why: 'end' })
            else if (region.at == 'known') setRegion(end, { at: 'standing', mark, why: region.why })
            else setRegion(end, markedAt(region, mark))

            const gliding = (activity.at == 'returning') && (activity.way == 'glide')

            if (enters && !gliding && ((activity.at == 'held') || inputRecent)) {
                if ((activity.at != 'held') || (activity.end != end)) activity = { at: 'held', end }
            }

            break

        }

        case 'scrolled': {

            const { end } = event

            if (event.read == 'clock') {

                const { mark, past, armed } = event

                setRegion(end, markedAt(regionAt(end), mark))

                if (!past) {

                    // at the mark or inside it. A return that was decided and has not started has nothing to return
                    if ((activity.at == 'returning') && (activity.end == end) && (activity.target === null)) activity = IDLE
                    else activity = clockStopped(activity, end)

                } else if (!armed) {

                    // past the mark with the gesture over: the return that follows is told by its own part
                    activity = clockStopped(activity, end)

                } else if ((activity.at == 'past') && (activity.end == end)) {

                    if (!activity.clock) activity = { ...activity, clock: true }

                } else if ((activity.at == 'idle') || (activity.at == 'past')) {

                    activity = { at: 'past', end, clock: true, travel: 0, drawn: 0 }

                }

            } else if (event.read == 'stretch') {

                const { travel, drawn } = event, stretched = !!(travel || drawn)

                if ((activity.at == 'past') && (activity.end == end)) {

                    if (!stretched && !activity.clock) activity = IDLE
                    else if ((activity.travel !== travel) || (activity.drawn !== drawn)) activity = { ...activity, travel, drawn }

                } else if (stretched && ((activity.at == 'idle') || (activity.at == 'past'))) {

                    activity = { at: 'past', end, clock: false, travel, drawn }

                }

            } else if ((activity.at != 'held') || (activity.end != end)) {

                activity = { at: 'held', end }

            }

            break

        }

        // a wheel, or a touch's start, stops the return of its way; so does a slide folded into what follows it
        case 'input':
        // the return of its way is over: scrolling has ended after a glide, or a slide has finished
        case 'returned': {

            if ((activity.at == 'returning') && (activity.way == event.way)) activity = IDLE

            break

        }

        case 'gestureEnded': {

            const { end } = event, region = regionAt(end)

            if (event.part == 'clock') {

                // the clock has run out. A standing end the gesture asks is asked again, and the return to its mark
                // is decided with it, in this one step, unless a finger is down or scrolling is held. A finger down
                // ends a return that was decided and has not started
                const asks = event.ask && (region.at == 'standing')

                if (asks) setRegion(end, { at: 'asking', mark: (region as any).mark, why: (region as any).why })

                if (asks && !event.finger && (activity.at != 'held')) {
                    if ((activity.at != 'returning') || (activity.end != end)) activity = { at: 'returning', end, way: 'glide', target: null }
                } else if (event.finger && (activity.at == 'returning') && (activity.end == end) && (activity.target === null)) {
                    activity = IDLE
                } else {
                    activity = clockStopped(activity, end)
                }

            } else if (activity.at != 'held') {

                const { way, target } = event

                if ((activity.at != 'returning') || (activity.end != end) || (activity.way != way) || (activity.target !== target)) {
                    activity = { at: 'returning', end, way, target }
                }

            }

            break

        }

        // the host has answered the ask this end is making. An answer for an ask no longer made is never told
        case 'answered': {

            const { end, outcome } = event, region = regionAt(end)

            if (region.at != 'asking') break

            if (outcome == 'rows') setRegion(end, AWAY)
            else setRegion(end, { at: 'standing', mark: region.mark, why: (outcome == 'none') ? 'end' : 'failed' })

            break

        }

        // what was known of this end no longer holds: its row has changed, the host has reset or re-fetched, rows
        // have come there, or its ask could not be made
        case 'invalidated': {

            if (regionAt(event.end).at != 'away') setRegion(event.end, AWAY)

            break

        }

        case 'holdReleased': {

            if (activity.at == 'held') activity = IDLE

            break

        }

        // a resize has moved the bands: the end stands where it stood, on a mark read again
        case 'resized': {

            setRegion(event.end, markedAt(regionAt(event.end), event.mark))

            break

        }

        // the axis has moved under the rows: a mark is a distance from the axis, and moves with it
        case 'shifted': {

            const { delta } = event

            if (!delta) break

            if (ownsActivity(tail)) tail = markedAt(tail, (tail as any).mark - delta)
            if (ownsActivity(head)) head = markedAt(head, (head as any).mark + delta)

            break

        }

    }

    activity = tieActivity(head, tail, activity)

    if ((head === state.head) && (tail === state.tail) && (activity === state.activity)) return state

    return { head, tail, activity }

}

export const createEndMachine = () => {

    let state = END_MACHINE_INITIAL

    return {
        tell: (event: EndEvent) => {
            state = stepEndMachine(state, event)
        },
        read: () => state,
    }

}
