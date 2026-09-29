export class CloseSaveCoordinator {
  private pending: Promise<void> | null = null;

  request(save: () => Promise<void>, close: () => Promise<void>) {
    if (this.pending) return this.pending;
    const task = (async () => { await save(); await close(); })();
    this.pending = task;
    void task.catch(() => {}).finally(() => { if (this.pending === task) this.pending = null; });
    return task;
  }
}
