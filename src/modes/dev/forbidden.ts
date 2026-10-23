// Characters the copy rules forbid, built from code points so this file holds none of them.
// Tests import it to check every string the modes show.
export const EM_DASH = String.fromCharCode(0x2014);
export const EN_DASH = String.fromCharCode(0x2013);

const range = (from: number, to: number) => String.fromCodePoint(from) + '-' + String.fromCodePoint(to);

/** Matches an em dash, an en dash or an emoji or pictograph. */
export const BAD_COPY = new RegExp('[' + EM_DASH + EN_DASH + range(0x1f300, 0x1faff) + range(0x2600, 0x27bf) + ']', 'u');
