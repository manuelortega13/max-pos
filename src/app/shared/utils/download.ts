/**
 * Trigger a browser "Save as…" for an in-memory Blob via a transient anchor.
 * Shared so any feature (reports CSV, database backup, …) downloads the same way.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the click has consumed the URL.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
