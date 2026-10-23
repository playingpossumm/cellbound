// Share or copy a plain text result. Web Share when the browser has it, the clipboard otherwise.
import { APP_NAME } from '../app/brand';

export type ShareOutcome = 'shared' | 'copied' | 'failed';

/** The address of the app, for the link that goes with a shared result. */
export function appLink(): string {
  try {
    return typeof location === 'undefined' ? '' : location.origin + location.pathname;
  } catch {
    return '';
  }
}

export async function shareResult(text: string, title = APP_NAME, url: string = appLink()): Promise<ShareOutcome> {
  const nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator;
  if (!nav) return 'failed';
  try {
    if (typeof nav.share === 'function') {
      await nav.share(url ? { title, text, url } : { title, text });
      return 'shared';
    }
  } catch (e) {
    // The player closed the share sheet: that is not a failure to copy.
    if (e instanceof DOMException && e.name === 'AbortError') return 'failed';
  }
  try {
    await nav.clipboard.writeText(url ? text + '\n' + url : text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
