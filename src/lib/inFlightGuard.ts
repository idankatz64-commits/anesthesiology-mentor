type AnyAsyncFn = (...args: any[]) => Promise<unknown>;

export function createInFlightGuard<T extends AnyAsyncFn>(fn: T): T {
  let inFlight = false;

  const guarded = async (...args: Parameters<T>) => {
    if (inFlight) return undefined;
    inFlight = true;
    try {
      return await fn(...args);
    } finally {
      inFlight = false;
    }
  };

  return guarded as T;
}
