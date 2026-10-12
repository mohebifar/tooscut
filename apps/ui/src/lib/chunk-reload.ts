/**
 * Recovery for failed route chunk downloads.
 *
 * Browsers cache a failed dynamic import for the life of the document, so
 * resetting the error boundary can never load the chunk. Only a full reload
 * can. TanStack Router's lazy route components already reload once per failed
 * chunk URL on their own, so this module only handles the reload that the
 * user starts from the error screen, and records whether it recovered.
 */

const PENDING_RELOAD_KEY = "tooscut:chunk-reload-url";

const CHUNK_LOAD_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i;

export function isChunkLoadError(error: unknown): error is Error {
  return error instanceof Error && CHUNK_LOAD_ERROR_PATTERN.test(error.message);
}

/**
 * Reloads the page. When the error names the failed chunk URL, remembers it
 * so that the next page load can check if the chunk loads now.
 */
export function reloadAfterChunkError(error: Error): void {
  const url = /https?:\/\/\S+/.exec(error.message)?.[0];
  if (url) {
    try {
      sessionStorage.setItem(PENDING_RELOAD_KEY, url);
    } catch {}
  }
  window.location.reload();
}

/** Returns the chunk URL saved by `reloadAfterChunkError` and forgets it. */
export function takePendingChunkReload(): string | null {
  try {
    const url = sessionStorage.getItem(PENDING_RELOAD_KEY);
    sessionStorage.removeItem(PENDING_RELOAD_KEY);
    return url;
  } catch {
    return null;
  }
}
