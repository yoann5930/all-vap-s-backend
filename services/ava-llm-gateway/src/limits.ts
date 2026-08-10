/** Rate limit mémoire process — par IP / clé. */
export class SlidingWindowRateLimit {
  private hits = new Map<string, number[]>();

  constructor(private readonly maxPerWindow: number, private readonly windowMs = 60_000) {}

  allow(key: string): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.maxPerWindow) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}

/** Circuit breaker simple — ouvre après N échecs Ollama. */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly threshold = 5,
    private readonly coolDownMs = 30_000
  ) {}

  get open(): boolean {
    return Date.now() < this.openUntil;
  }

  success() {
    this.failures = 0;
    this.openUntil = 0;
  }

  fail() {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openUntil = Date.now() + this.coolDownMs;
      this.failures = 0;
    }
  }
}
