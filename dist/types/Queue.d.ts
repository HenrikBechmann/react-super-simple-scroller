export declare const DEFAULT_STALL_MS = 5000;
export default class Queue {
    queue: any[];
    pendingPromise: boolean;
    onStall: any;
    onIdle: any;
    onDropped: any;
    stallMs: number;
    runSerial: number;
    stallTimer: any;
    stallWarnedSerial: number;
    stopped: boolean;
    dropping: Set<unknown>;
    dropAnswer: any;
    constructor({ onStall, onIdle, onDropped, stallMs }?: {
        onStall?: any;
        onIdle?: any;
        onDropped?: any;
        stallMs?: number;
    });
    stop(answer?: any): void;
    start(): void;
    isBusy(): boolean;
    enqueue(promise: any, label?: any): Promise<unknown>;
    armStall(): void;
    clearStall(): void;
    reportIdle(): void;
    drop(): void;
    dequeue(): boolean;
}
