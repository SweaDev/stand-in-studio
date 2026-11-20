/** Fixed-capacity FIFO buffer; the oldest item is overwritten when full. */
export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private start = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError('capacity must be a positive integer');
    }
    this.items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(item: T): void {
    const idx = (this.start + this.count) % this.capacity;
    this.items[idx] = item;
    if (this.count < this.capacity) this.count++;
    else this.start = (this.start + 1) % this.capacity;
  }

  /** Item at logical index (0 = oldest). */
  at(i: number): T | undefined {
    if (i < 0 || i >= this.count) return undefined;
    return this.items[(this.start + i) % this.capacity];
  }

  last(): T | undefined {
    return this.at(this.count - 1);
  }

  toArray(): T[] {
    const out: T[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.at(i) as T);
    return out;
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
    this.items.fill(undefined);
  }
}

/** Samples kept for a sliding time window (e.g. "the last 15 s"). */
export class TimeWindow<T> {
  private samples: { t: number; v: T }[] = [];

  constructor(readonly windowMs: number) {}

  push(t: number, v: T): void {
    this.samples.push({ t, v });
    this.prune(t);
  }

  /** Drops samples older than `now - windowMs`. */
  prune(now: number): void {
    const cutoff = now - this.windowMs;
    let i = 0;
    while (i < this.samples.length && (this.samples[i] as { t: number }).t < cutoff) i++;
    if (i > 0) this.samples.splice(0, i);
  }

  values(): T[] {
    return this.samples.map((s) => s.v);
  }

  entries(): readonly { t: number; v: T }[] {
    return this.samples;
  }

  get size(): number {
    return this.samples.length;
  }

  /** Time span covered by the stored samples. */
  span(): number {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    return first && last ? last.t - first.t : 0;
  }

  clear(): void {
    this.samples = [];
  }
}
