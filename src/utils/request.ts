/**
 * Central Request Infrastructure & Deadlines
 *
 * Provides bounded cancellable deadlines, AbortSignal propagation to SDK query builders,
 * and request deduplication helpers.
 */

import { startStage } from './startupMetrics';

export const REQUEST_TIMEOUT_MS = 9000;

export interface ReadRequestOptions {
  /** Explicit retry replaces the current read rather than joining a hung flight. */
  force?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Execute a read request with bounded cancellable deadlines and propagate
 * the internal AbortSignal directly to SDK query builders.
 *
 * If options.signal is provided and aborted by the caller, builder execution
 * is aborted immediately with caller's abort reason.
 * If the deadline expires (default 9000ms), an abort signal is triggered with a TimeoutError.
 */
export async function readRequest<T>(
  label: string,
  builder: (signal: AbortSignal) => PromiseLike<T>,
  options?: ReadRequestOptions,
): Promise<T> {
  const finishStage = startStage(label.startsWith('feed:') ? label.split(':').slice(0, 2).join(':') : label);
  const timeoutMs = options?.timeoutMs ?? REQUEST_TIMEOUT_MS;

  // If caller already aborted the request, fail fast without invoking builder
  if (options?.signal?.aborted) {
    const err = options.signal.reason || new Error(`[${label}] Request aborted`);
    throw err;
  }

  const controller = new AbortController();

  const onExternalAbort = () => {
    controller.abort(options?.signal?.reason);
  };

  if (options?.signal) {
    options.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbortListener: (() => void) | undefined;

  const cancellationPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timer = undefined;
      const timeoutErr = new Error(`[${label}] Request timed out after ${timeoutMs}ms`);
      timeoutErr.name = 'TimeoutError';
      controller.abort(timeoutErr);
      reject(timeoutErr);
    }, timeoutMs);

    onAbortListener = () => {
      if (options?.signal?.aborted) {
        reject(options.signal.reason || new Error(`[${label}] Request aborted`));
      } else {
        reject(controller.signal.reason || new Error(`[${label}] Request aborted`));
      }
    };
    controller.signal.addEventListener('abort', onAbortListener, { once: true });
  });

  try {
    const result = await Promise.race([builder(controller.signal), cancellationPromise]);
    finishStage();
    return result;
  } catch (err: any) {
    finishStage(controller.signal.aborted ? controller.signal.reason?.name || 'cancelled' : 'error');
    if (controller.signal.aborted) {
      if (options?.signal?.aborted) {
        throw options.signal.reason || err;
      }
      throw controller.signal.reason || err;
    }
    throw err;
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    if (onAbortListener !== undefined) {
      controller.signal.removeEventListener('abort', onAbortListener);
    }
    if (options?.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Attach a caller-specific abort signal to an existing promise without cancelling
 * the underlying shared work for other concurrent callers.
 */
export async function withCallerSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw signal.reason || new Error('Aborted');

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason || new Error('Aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

/**
 * SingleFlight coalesces concurrent identical operations into a single shared execution.
 */
export class SingleFlight<T = any> {
  private active = new Map<string, Promise<T>>();

  async run(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.active.get(key);
    if (existing) return existing;

    const promise = fn().finally(() => {
      if (this.active.get(key) === promise) {
        this.active.delete(key);
      }
    });

    this.active.set(key, promise);
    return promise;
  }

  has(key: string): boolean {
    return this.active.has(key);
  }

  clear(): void {
    this.active.clear();
  }
}
