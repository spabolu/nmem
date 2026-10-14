# nmem UI language

This page says how nmem's website looks and why. `docs/design/v1-user-facing.md` owns what each screen says. This page owns how it says it. Every rule names the page it came from. Each page was fetched on Oct 13, 2026.

## Sources

- Primer color usage: https://primer.style/product/getting-started/foundations/color-usage/
- Primer layout: https://primer.style/product/getting-started/foundations/layout/
- Primer UnderlineNav: https://primer.style/product/components/underline-nav/
- Primer SegmentedControl: https://primer.style/product/components/segmented-control/
- Primer Timeline: https://primer.style/product/components/timeline/
- Primer focus management: https://primer.style/accessibility/focus-management/
- Primer motion and animation: https://primer.style/accessibility/design-guidance/motion-and-animation/
- Fluent 2 layout: https://fluent2.microsoft.design/layout
- Fluent 2 elevation: https://fluent2.microsoft.design/elevation
- Fluent 2 motion: https://fluent2.microsoft.design/motion

## Color

Rule. Colors are design tokens with functional names, and every pattern works in light and dark mode. Source: Primer color usage.

In nmem:

- `nmem/src/app/globals.css` imports Primer's primitives, which declare every color once using Primer's functional names. Examples are `--fgColor-default`, `--fgColor-muted`, `--bgColor-muted`, `--borderColor-default`, and `--bgColor-attention-muted`.
- A `prefers-color-scheme: dark` block redefines the same names. No rule outside `:root` holds a raw hex value.
- nmem's own purple has two tokens in the same style, `--bgColor-nmem-emphasis` and `--bgColor-nmem-muted`.
- Status keeps one meaning per color. Green means up to date. Attention yellow means out of date. Muted gray means never written down. The words always appear next to the dot, so color is never the only signal.

Rule. Text meets WCAG AA. That is 4.5:1 for body text and 3:1 for focus rings and status dots. Primer's primitives own these pairs, and nmem adds no text color of its own. Source: Primer color usage.

## Spacing and layout

Rule. Spacing comes from a ramp with a 4px base unit. Closeness means things are related, and more space around an element gives it more weight. Source: Fluent 2 layout.

In nmem:

- Page-level padding, margins, and gaps are multiples of 4: 8, 12, 16, 24, and 32.
- The timeline board keeps its measured offsets, because `harness/app-parity.mjs` checks that its labels are not clipped.

Rule. Follow the reader's natural order, top to bottom, and keep the page focused on its content. Source: Primer layout.

In nmem:

- Below 768px, every view is one column. The topic page puts the answer first and the tree after it.
- The header wraps. Topics and Timeline take their own row.
- No view scrolls sideways at 390px. `node harness/app-parity.mjs <dir>` measures this and prints the result.

## Navigation

Rule. Use UnderlineNav for switching between the main views of one object. The current item gets a heavier weight and an underline, and is marked as the current page. Source: Primer UnderlineNav.

In nmem, Topics and Timeline are an UnderlineNav. The current tab has `aria-current="page"`.

Rule. Use SegmentedControl to switch between views of the same content. Source: Primer SegmentedControl.

In nmem, **Engineer** and **Non-engineer** are a SegmentedControl, because they show the same page in different words. The pair is a labelled group, and the selected option has `aria-current`. They stay links, so the choice lives in the URL and works without script.

## Timeline

Rule. A Timeline shows events in order, joined by a line, each item with a badge. Source: Primer Timeline.

In nmem:

- At desktop width, the timeline keeps its horizontal time axis, since the range itself is what the reader studies.
- Below 768px, the axis is hidden. The cards stack into a vertical list, and each card shows all of its text.

## Focus and keyboard

Rule. Every interactive element is reachable by keyboard and shows a visible focus indicator. Source: Primer focus management.

In nmem:

- Links, buttons, inputs, and timeline cards show a 2px `--focus-outlineColor` ring on `:focus-visible`.
- Placed timeline cards take focus with `tabindex="0"`. Focusing a card opens it the same way hovering does, so no content needs a mouse.
- At phone width, the cards are fully open from the start.

## Elevation and motion

Rule. Use shadow only to show that an element sits above the surface. Prefer small, crisp shadows for things that sit close to the surface. Source: Fluent 2 elevation.

In nmem, cards use a border and a 1px resting shadow. Nothing floats, so nothing needs a deeper shadow.

Rule. Use motion only when it serves a function, and give people control over it. Source: Primer motion and animation, Fluent 2 motion.

In nmem, the site has no decorative motion. `prefers-reduced-motion: reduce` turns off every transition and animation.

## Primer audit (UI-2)

Checked Oct 13, 2026 against @primer/primitives 11.10.0 (https://unpkg.com/@primer/primitives/dist/css/functional/themes/light.css and dark.css, typography.css) and the primer.style component pages below.

| Area | Gap found | Fix | Source |
| --- | --- | --- | --- |
| Color | light `fgColor-danger` was #cf222e, Primer is #d1242f | changed | https://unpkg.com/@primer/primitives/dist/css/functional/themes/light.css |
| Color | light `borderColor-attention-emphasis` was #d4a72c, Primer is #9a6700 | changed | same |
| Color | `focus-outlineColor` was a copied hex, Primer points it at `borderColor-accent-emphasis` | now a var() | light.css, dark.css |
| Shadow | one-layer `shadow-resting-small-color`, Primer ships a two-layer `shadow-resting-small` | changed, light and dark | light.css, dark.css |
| Type | sizes 11, 13, 13.5, 18, 22, 24, 26, 28 px; Primer text styles use 12, 14, 16, 20, 32 | snapped outside the timeline board; page titles 32 (20 on phones) | https://unpkg.com/@primer/primitives/dist/css/functional/typography/typography.css |
| Type | Primer's stack leads with Mona Sans VF | not adopted: needs a webfont download | typography.css |
| UnderlineNav | no leading icons | vendored Octicons list-unordered and history | https://primer.style/product/components/underline-nav/, https://github.com/primer/octicons |
| TreeView | indents 32 and 42 px, 3px active bar | 16 px steps, 4px bar | https://primer.style/product/components/tree-view/ |
| Timeline | `.decision` row style leaked onto pins and cards, so pins drew as ovals | scoped to the decisions list | https://primer.style/product/components/timeline/ |
| Label | chips filled with `bgColor-muted`; Primer Label is outlined, 20px | transparent fill | https://primer.style/product/components/label/ |
| Avatar | 20 and 32 px circles fit the 16 to 32 base-4 scale | none | https://primer.style/product/components/avatar/ |
| Button | 32px, 12px padding matches medium | none | https://github.com/primer/css/blob/main/src/buttons/button.scss |
| Banner | freshness notes lack a leading icon | left open | https://primer.style/product/components/banner/ |
| Blankslate | empty and 404 views lack the icon, heading, description anatomy | left open | https://primer.style/product/components/blankslate/ |
| PageHeader, CounterLabel | not checked in depth | left open | https://primer.style/product/components/page-header/, https://primer.style/product/components/counter-label/ |

Timeline board labels stay at 11 and 13 px because `harness/app-parity.mjs` measures them for clipping.

## Rerun the checks

- `node harness/app-parity.mjs <dir>` checks the screen rules and the timeline layout against `next start`, then shoots every view through Chrome DevTools at 1400px light, 1400px dark, and 390px into `<dir>`. It also reports any view that scrolls sideways.
- `node harness/app-parity.mjs <dir> --engine harness/runs/<runId>/nmem/t1` runs the same checks on the engine snapshots of a scored run and shoots each repo's topics, timeline, search, and one item page.
- `node harness/pixel-diff.mjs <dir>` compares those shots with the frozen set in `harness/shots-baseline`.
