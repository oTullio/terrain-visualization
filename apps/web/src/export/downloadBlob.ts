/**
 * downloadBlob — trigger a browser download for an in-memory Blob.
 *
 * The standard "create object URL → synthetic <a download> click → revoke
 * URL" pattern. The anchor is appended to document.body and removed
 * immediately after click, so it doesn't linger in the DOM.
 *
 * The object URL is revoked synchronously after the click. Browsers keep
 * the download alive after revoke (the URL has been resolved into a
 * navigation by then), so this is safe and avoids leaking the blob.
 */

/**
 * Trigger a download of the given Blob as the given filename.
 *
 * No-op in environments without `document` or `URL.createObjectURL`
 * (server-side rendering, some test setups).
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // Hide it visually — some browsers render the anchor briefly otherwise.
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}
