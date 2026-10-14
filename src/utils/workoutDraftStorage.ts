/** Shared storage identity kept separate from exercise validation and scoring. */
export const draftStorageKey = (owner: string) => `fitgroup:workout-draft:v1:${owner}`;

/** undefined means no photo; null means cleanup cannot safely establish that. */
export function readDraftPhoto(owner: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(draftStorageKey(owner));
    if (!raw) return undefined;
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || value.owner !== owner || typeof value.id !== 'string' || !value.id || (value.photoUrl !== undefined && typeof value.photoUrl !== 'string')) return null;
    return value.photoUrl || undefined;
  } catch { return null; }
}
