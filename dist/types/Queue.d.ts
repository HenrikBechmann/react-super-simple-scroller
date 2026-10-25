export declare const DEFAULT_STALL_MS = 5000;
export default class Queue {
    queue: any[];
    pendingPromise: boolean;
    onStall: any;
    onIdle: any;
    stallMs: number;
    runSerial: number;
    stallTimer: any;
    stallWarnedSerial: number;
    constructor({ onStall, onIdle, stallMs }?: {
        onStall?: any;
        onIdle?: any;
        stallMs?: number;
    });
    isBusy(): boolean;
    enqueue(promise: any): Promise<unknown>;
    armStall(): void;
    clearStall(): void;
    reportIdle(): void;
    dequeue(): boolean;
}
