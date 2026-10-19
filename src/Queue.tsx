// queueClass.tsx

// h/t https://medium.com/@karenmarkosyan/how-to-manage-promises-into-dynamic-queue-with-vanilla-javascript-9d0d1f8d4df5
export default class Queue {
  queue = [];
  pendingPromise = false;

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
        this.dequeue();
    });
  }

dequeue() {
    if (this.pendingPromise) {
      return false;
    }
    const item = this.queue.shift();
    if (!item) {
      return false;
    }
    try {
      this.pendingPromise = true;
      item.promise()
        .then((value) => {
          this.pendingPromise = false;
          item.resolve(value);
          this.dequeue();
        })
        .catch(err => {
          this.pendingPromise = false;
          item.reject(err);
          this.dequeue();
        })
    } catch (err) {
      this.pendingPromise = false;
      item.reject(err);
      this.dequeue();
    }
    return true;
  }
}
