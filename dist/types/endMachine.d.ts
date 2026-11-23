export type End = 'head' | 'tail';
export type EndReason = 'end' | 'failed';
export type EndRegion = {
    at: 'away';
} | {
    at: 'known';
    why: EndReason;
} | {
    at: 'standing';
    mark: number;
    why: EndReason;
} | {
    at: 'asking';
    mark: number;
    why: EndReason;
};
export type EndActivity = {
    at: 'idle';
} | {
    at: 'past';
    end: End;
    clock: boolean;
    travel: number;
    drawn: number;
} | {
    at: 'returning';
    end: End;
    way: 'glide' | 'slide';
    target: number | null;
} | {
    at: 'held';
    end: End;
};
export type EndMachineState = {
    head: EndRegion;
    tail: EndRegion;
    activity: EndActivity;
};
export type EndEvent = {
    type: 'runEnded';
    end: End;
    reason: EndReason;
} | {
    type: 'arrived';
    end: End;
    mark: number;
    enters: boolean;
    inputRecent: boolean;
    finger: boolean;
} | {
    type: 'scrolled';
    end: End;
    read: 'clock';
    mark: number;
    past: boolean;
    armed: boolean;
} | {
    type: 'scrolled';
    end: End;
    read: 'stretch';
    travel: number;
    drawn: number;
} | {
    type: 'scrolled';
    end: End;
    read: 'arrival';
} | {
    type: 'input';
    way: 'glide' | 'slide';
} | {
    type: 'gestureEnded';
    end: End;
    part: 'clock';
    ask: boolean;
    finger: boolean;
} | {
    type: 'gestureEnded';
    end: End;
    part: 'return';
    way: 'glide' | 'slide';
    target: number;
} | {
    type: 'answered';
    end: End;
    outcome: 'rows' | 'none' | 'failed';
} | {
    type: 'invalidated';
    end: End;
} | {
    type: 'returned';
    way: 'glide' | 'slide';
} | {
    type: 'holdReleased';
} | {
    type: 'resized';
    end: End;
    mark: number;
} | {
    type: 'measured';
    end: End;
    mark: number;
} | {
    type: 'shifted';
    delta: number;
};
export declare const END_MACHINE_INITIAL: EndMachineState;
export declare const stepEndMachine: (state: EndMachineState, event: EndEvent) => EndMachineState;
export declare const createEndMachine: () => {
    tell: (event: EndEvent) => void;
    read: () => EndMachineState;
};
export declare const isEndKnown: (state: EndMachineState, end: End) => boolean;
export declare const isEndStanding: (state: EndMachineState, end: End) => boolean;
export declare const isEndAsking: (state: EndMachineState, end: End) => boolean;
export declare const endReasonAt: (state: EndMachineState, end: End) => EndReason | null;
export declare const endMarkAt: (state: EndMachineState, end: End) => number | null;
