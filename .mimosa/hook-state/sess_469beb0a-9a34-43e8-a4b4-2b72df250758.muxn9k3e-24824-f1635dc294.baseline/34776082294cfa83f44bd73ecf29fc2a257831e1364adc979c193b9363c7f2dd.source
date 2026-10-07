/**
 * Single source of truth for the application version shown in the UI and
 * embedded in exported backups/reports.
 *
 * The value is injected at build time by Vite (`__APP_VERSION__`, sourced from
 * package.json). When running under plain Node/tsx (tests, scripts) the global
 * is not defined, so we fall back to `VITE_APP_VERSION` and finally a safe
 * placeholder. Never maintain a second hard-coded version constant elsewhere.
 */
declare const __APP_VERSION__: string | undefined;

function resolveAppVersion(): string {
  try {
    if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.trim().length > 0) {
      return __APP_VERSION__.trim();
    }
  } catch {
    // `__APP_VERSION__` is not defined in this runtime (tests, tooling).
  }

  const env = (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env) || {};
  if (typeof env.VITE_APP_VERSION === 'string' && env.VITE_APP_VERSION.trim().length > 0) {
    return env.VITE_APP_VERSION.trim();
  }

  return '0.0.0';
}

export const APP_NAME = 'FitGroup';

/** Application version — shared by the UI, JSON backup and TXT report. */
export const APP_VERSION = resolveAppVersion();

/**
 * Version of the JSON export document shape. Bump this whenever the export
 * schema changes in a way that older importers would not understand.
 */
export const EXPORT_SCHEMA_VERSION = 2;
