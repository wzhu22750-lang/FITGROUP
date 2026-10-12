/**
 * Pagination helpers. Export uses immutable-id keyset traversal, not offsets.
 * Page sizes must stay within the backend row cap: both range and limit are
 * subject to provider caps.
 */

export interface FetchAllPagesOptions {
  /** Cancellation signal propagated from the caller. */
  signal?: AbortSignal;
  /** Hard safety stop to avoid infinite loops on misbehaving backends. */
  maxPages?: number;
  /** Continue through short provider-capped pages until an empty page. */
  exhaustUntilEmpty?: boolean;
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
  validatePageSize(pageSize);

  const maxPages = options.maxPages ?? 100_000;
  validatePageSize(maxPages);
  const collected: T[] = [];
  let from = 0;

  for (let page = 0; page < maxPages; page += 1) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error('分页查询已取消');
    }

    const rows = await fetchPage(from, from + pageSize - 1);
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error('分页查询已取消');
    }
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

export function validatePageSize(pageSize: number): void {
  if (!Number.isFinite(pageSize) || !Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error('分页查询: pageSize 必须为有限正整数');
  }
}

/** Descending immutable string ids; not a transactional snapshot of mutable rows. */
export async function fetchAllPagesById<T extends { id: string }>(
  fetchPage: (beforeId: string | undefined, limit: number) => Promise<T[]>,
  pageSize = 400,
  options: FetchAllPagesOptions = {},
): Promise<T[]> {
  validatePageSize(pageSize);
  const maxPages = options.maxPages ?? 100_000;
  validatePageSize(maxPages);
  const collected: T[] = [];
  const seenIds = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('分页查询已取消');
    const rows = await fetchPage(cursor, pageSize);
    if (options.signal?.aborted) throw options.signal.reason ?? new Error('分页查询已取消');
    if (!Array.isArray(rows)) throw new Error('分页查询返回了非数组结果');
    if (rows.length > pageSize) throw new Error('分页查询超过请求页大小');
    let previous = cursor;
    for (const row of rows) {
      // ORDER BY and lt use the database's collation. JS string ordering may
      // differ, so detect repeated ids/cursors without comparing their order.
      if (typeof row?.id !== 'string' || !row.id || seenIds.has(row.id)) {
        throw new Error('分页查询 id 游标重复或无效');
      }
      seenIds.add(row.id);
      previous = row.id;
    }
    collected.push(...rows);
    if (rows.length === 0 || (!options.exhaustUntilEmpty && rows.length < pageSize)) return collected;
    cursor = previous;
  }
  throw new Error('分页查询超过安全页数上限');
}
