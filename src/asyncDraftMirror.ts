type DraftOperation = () => Promise<void>;

type PendingDraft = {
  timer: ReturnType<typeof setTimeout>;
  operation: DraftOperation;
};

// queue recovery writes without blocking the editor
export class AsyncDraftMirror {
  private readonly pending = new Map<string, PendingDraft>();
  private queue: Promise<void> = Promise.resolve();

  schedule(key: string, operation: DraftOperation, delay = 180) {
    const previous = this.pending.get(key);
    if (previous) clearTimeout(previous.timer);
    const timer = setTimeout(() => {
      const pending = this.pending.get(key);
      if (!pending || pending.timer !== timer) return;
      this.pending.delete(key);
      void this.enqueue(pending.operation).catch(() => {});
    }, delay);
    this.pending.set(key, { timer, operation });
  }

  flush(key: string): Promise<void> {
    const pending = this.pending.get(key);
    if (!pending) return this.queue;
    clearTimeout(pending.timer);
    this.pending.delete(key);
    return this.enqueue(pending.operation);
  }

  async then(key: string, operation: DraftOperation) {
    await this.flush(key);
    await this.enqueue(operation);
  }

  async drain() {
    for (const key of [...this.pending.keys()]) await this.flush(key);
    await this.queue;
  }

  private enqueue(operation: DraftOperation) {
    const task = this.queue.catch(() => {}).then(operation);
    this.queue = task.catch(() => {});
    return task;
  }
}
