/**
 * Checks WCAG AA contrast for the text and background token pairs styles.css uses, in light and dark.
 *
 *   node web/contrast.mjs
 */
import fs from 'node:fs';

const css = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const dark = css.indexOf('@media (prefers-color-scheme: dark)');
const tokensOf = (text) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6,8});/gi)].map((m) => [m[1], m[2]]));
const light = tokensOf(css.slice(0, dark));
const schemes = { light, dark: { ...light, ...tokensOf(css.slice(dark, css.indexOf('}\n}', dark))) } };

const rgba = (hex) => [1, 3, 5, 7].map((i) => (hex.length > i ? parseInt(hex.slice(i, i + 2), 16) / 255 : 1));
const over = (top, under) => top.slice(0, 3).map((c, i) => c * top[3] + under[i] * (1 - top[3]));
const lum = (rgb) => rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);

const text = 4.5;
const graphic = 3;
const pairs = [
  ['fgColor-default', 'bgColor-default', text],
  ['fgColor-default', 'bgColor-muted', text],
  ['fgColor-muted', 'bgColor-default', text],
  ['fgColor-muted', 'bgColor-muted', text],
  ['fgColor-accent', 'bgColor-default', text],
  ['fgColor-accent', 'bgColor-muted', text],
  ['fgColor-default', 'bgColor-nmem-muted', text],
  ['fgColor-done', 'bgColor-default', text],
  ['fgColor-danger', 'bgColor-default', text],
  ['fgColor-attention', 'bgColor-default', text],
  ['fgColor-attention', 'bgColor-attention-muted', text],
  ['fgColor-default', 'bgColor-attention-muted', text],
  ['fgColor-default', 'bgColor-success-muted', text],
  ['fgColor-default', 'bgColor-severe-muted', text],
  ['fgColor-onEmphasis', 'bgColor-emphasis', text],
  ['fgColor-onEmphasis', 'bgColor-nmem-emphasis', text],
  ['fgColor-onEmphasis', 'bgColor-done-emphasis', text],
  ['borderColor-accent-emphasis', 'bgColor-default', graphic],
  ['fgColor-success', 'bgColor-default', graphic],
];

let failed = 0;
for (const [scheme, tokens] of Object.entries(schemes)) {
  const page = rgba(tokens['bgColor-default']);
  for (const [fg, bg, need] of pairs) {
    const back = over(rgba(tokens[bg]), page);
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const r = ratio(lum(over(rgba(tokens[fg]), back)), lum(back));
    const ok = r >= need;
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${scheme.padEnd(5)} ${fg} on ${bg}: ${r.toFixed(2)} (need ${need})`);
  }
}
console.log(failed ? `FAIL ${failed}` : 'PASS');
process.exit(failed ? 1 : 0);
