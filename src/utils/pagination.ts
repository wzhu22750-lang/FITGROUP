/**
 * Generic offset pagination helper used by full-history data export.
 *
 * PostgREST / Supabase applies a hard row cap to `.limit()` while `.range()`
 * keeps working across pages. This helper keeps pulling pages until a short
 * page is returned, so callers can read the *complete* history instead of the
 * first N rows used by performance-sensitive feed queries.
 */

export interface FetchAllPagesOptions {
  /** Cancellation signal propagated from the caller. */
  signal?: AbortSignal;
  /** Hard safety stop to avoid infinite loops on misbehaving backends. */
  maxPages?: number;
}

/**
 * Repeatedly call `fetchPage(from, to)` (inclusive range) until a page shorter
 * than `pageSize` is returned. Rows are returned in the order the pages
 * produced them.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 400,
  options: FetchAllPagesOptions = {},
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error('fetchAllPages: pageSize 必须为正整数');
  }

  const maxPages = options.maxPages ?? 100_000;
  const collected: T[] = [];
  let from = 0;

  for (let page = 0; page < maxPages; page += 1) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error('分页查询已取消');
    }

    const rows = await fetchPage(from, from + pageSize - 1);
    if (!Array.isArray(rows)) {
      throw new Error('分页查询返回了非数组结果');
    }

    collected.push(...rows);
    if (rows.length < pageSize) {
      return collected;
    }

    from += pageSize;
  }

  throw new Error('分页查询超过安全页数上限');
}
