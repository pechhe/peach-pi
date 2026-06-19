/**
 * True for URLs that should leave the app and open in the OS default
 * browser/handler. Covers `http:`, `https:`, and `mailto:`. Everything else
 * (relative paths, `file:`, `about:blank`, custom schemes) is treated as
 * in-app navigation and blocked by the window's own guard.
 */
export function isExternalUrl(url: string): boolean {
  return /^https?:$/i.test(url) || /^mailto:/i.test(url);
}
