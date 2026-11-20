/** Minimal typed event emitter (Observer) with no Node or DOM dependency. */
export class Emitter<Events extends { [K in keyof Events]: unknown }> {
  private listeners: { [K in keyof Events]?: Set<(payload: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.listeners[event];
    if (!set) {
      set = new Set();
      this.listeners[event] = set;
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners[event];
    if (!set) return;
    for (const fn of [...set]) fn(payload);
  }

  clear(): void {
    this.listeners = {};
  }
}
