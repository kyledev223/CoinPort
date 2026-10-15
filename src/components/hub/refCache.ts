/**
 * Shared resources with reference counting: the first `acquire` of a key
 * creates the value, every `acquire` must be paired with a `release`, and the
 * last `release` disposes it. Used for per-coin GPU textures, so a truck that
 * leaves the hub frees its textures.
 */
export class RefCache<T extends { dispose(): void }> {
  private readonly entries = new Map<string, { value: T; refs: number }>();

  acquire(key: string, create: () => T): T {
    const entry = this.entries.get(key);
    if (entry) {
      entry.refs++;
      return entry.value;
    }
    const value = create();
    this.entries.set(key, { value, refs: 1 });
    return value;
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (--entry.refs > 0) return;
    this.entries.delete(key);
    entry.value.dispose();
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }
}
