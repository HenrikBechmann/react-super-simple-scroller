// Queue.tsx

// h/t https://medium.com/@karenmarkosyan/how-to-manage-promises-into-dynamic-queue-with-vanilla-javascript-9d0d1f8d4df5

// One task runs at a time; the rest wait in order.
//
// A task that enqueues another task on the same queue and awaits it never finishes: the second task waits for
// the first to end, and the first is waiting for the second. The queue cannot tell a nested task from a
// waiting one, so nesting is not supported; a task that needs another operation's work calls that
// operation's function directly, or returns and lets its caller enqueue it. In the scroller every fetch runs
// inside a queued task, so a host's fetchCells that awaits one of the scroller's calls (insert, remove, move,
// replace, fetchCradleCells, restoreScrollPositions) before it returns is this shape. The queue warns through
// onStall, once per running task, when a task has waited behind it for stallMs: a stall is what a nested
// enqueue looks like from here, and the warning says so.
//
// The queue reports through onIdle, once, when the task that ended was the last one waiting: a caller refused
// while a task ran (the scroller's observer reconnect) is answered by the queue itself, not by the next caller
export const DEFAULT_STALL_MS = 5000

export default class Queue {
  queue = [];
  pendingPromise = false;
  onStall = null;
  onIdle = null;
  stallMs = DEFAULT_STALL_MS;
  // the running task's number, so a stall timer can tell whether the task it was armed behind still runs
  runSerial = 0;
  stallTimer = null;
  stallWarnedSerial = 0;

  constructor({ onStall = null, onIdle = null, stallMs = DEFAULT_STALL_MS } = {}) {
    this.onStall = onStall;
    this.onIdle = onIdle;
    this.stallMs = stallMs;
  }

  // a task is running, or one is waiting to run. dequeue shifts a task off the queue before it starts it, so
  // queue.length alone reads as idle while the only task runs
  isBusy() {
    return this.pendingPromise || this.queue.length > 0;
  }

  enqueue(promise) {
    return new Promise((resolve, reject) => {
        this.queue.push({
            promise,
            resolve,
            reject,
        });
        if (this.pendingPromise) this.armStall();
        this.dequeue();
    });
  }

  armStall() {
    if (!this.onStall || this.stallTimer || this.stallWarnedSerial == this.runSerial) return;
    const serial = this.runSerial, armedAt = Date.now();
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      if (!this.pendingPromise || this.runSerial != serial) return;
      this.stallWarnedSerial = serial;
      try {
        this.onStall({ waitedMs: Date.now() - armedAt, waiting: this.queue.length });
      } catch (err) {
        // a reporter that throws must not take the queue down
      }
    }, this.stallMs);
  }

  clearStall() {
    if (!this.stallTimer) return;
    clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  reportIdle() {
    if (!this.onIdle) return;
    try {
      this.onIdle();
    } catch (err) {
      // a reporter that throws must not take the queue down
    }
  }

  dequeue() {
    if (this.pendingPromise) {
      return false;
    }
    const item = this.queue.shift();
    if (!item) {
      return false;
    }
    const finish = () => {
      this.pendingPromise = false;
      this.clearStall();
      if (this.queue.length === 0) this.reportIdle();
    };
    try {
      this.pendingPromise = true;
      this.runSerial++;
      if (this.queue.length) this.armStall();
      item.promise()
        .then((value) => {
          finish();
          item.resolve(value);
          this.dequeue();
        })
        .catch(err => {
          finish();
          item.reject(err);
          this.dequeue();
        })
    } catch (err) {
      finish();
      item.reject(err);
      this.dequeue();
    }
    return true;
  }
}
