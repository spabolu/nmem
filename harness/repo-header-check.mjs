import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const [base, output, prefix] = process.argv.slice(2);
if (!base || !output || !/^[a-z0-9-]+$/.test(prefix ?? "")) {
  throw new Error("usage: node harness/repo-header-check.mjs <base-url> <output-dir> <session-prefix>");
}
const config = { base: new URL(base).origin, output: resolve(output), prefix };
mkdirSync(config.output, { recursive: true });

function command(executable, args) {
  const result = spawnSync(executable, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 600_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${executable} failed\n${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stdout, /### Error/);
  return result.stdout.trim();
}

const html = command("curl", ["--silent", "--fail", `${config.base}/hearthware/tally/search?q=bill`]);
for (const pattern of [
  /<nav aria-label="Breadcrumb"[^>]*>[\s\S]*?https:\/\/github\.com\/hearthware[\s\S]*?>hearthware<\/a>/,
  /<a[^>]*href="\/hearthware\/tally\?audience=eng"[^>]*>tally<\/a>/,
  /<form[^>]*action="\/hearthware\/tally\/search"[^>]*>[\s\S]*?name="audience" value="eng"/,
  /<input[^>]*name="q"[^>]*value="bill"/,
  /<nav aria-label="Repository"[^>]*>[\s\S]*?>Wiki<\/a>[\s\S]*?>Timeline<\/a>/,
]) {
  assert.match(html, pattern);
}
console.log("PASS curl HTML contains canonical crumb, search action, audience, query and tabs.");

async function checkHeader(page, config) {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const routes = [
    ["door", "/hearthware/tally"],
    ["topic", "/hearthware/tally/topics/root"],
    ["timeline", "/hearthware/tally/timeline"],
    ["search", "/hearthware/tally/search?q=bill"],
    ["home", "/"],
    ["design-agent", "/langchain-ai/design-agent"],
  ];
  const widths = [1920, 1400, 1280, 1024, 768, 390];
  let pages = 0;
  const screenshots = [];
  for (const mode of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: mode });
    for (const width of widths) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [name, path] of routes) {
        const response = await page.goto(`${config.base}${path}`);
        assert(response.status() === 200, `${path} status ${response.status()}`);
        await page.locator("main:visible:not([aria-busy=true])").waitFor();
        await page.locator("[data-repo-band-skeleton]").waitFor({ state: "detached" });
        await page.locator("header:visible").waitFor();
        await page.evaluate(() => document.fonts.ready);
        const facts = await page.evaluate(() => {
          const headers = [...document.querySelectorAll("header")].filter((el) => el.checkVisibility());
          const header = headers[0];
          const row = header.firstElementChild;
          const crumb = header.querySelector('[aria-label="Breadcrumb"]');
          const tabs = header.querySelector('[aria-label="Repository"]');
          const input = header.querySelector('input[name="q"]');
          const style = (el) => getComputedStyle(el);
          const rect = (el) => el.getBoundingClientRect().toJSON();
          const links = (el) => [...el.querySelectorAll("a")].map((a) => ({
            label: a.textContent,
            href: a.getAttribute("href"),
            target: a.target,
            box: rect(a),
            fontSize: style(a).fontSize,
            weight: style(a).fontWeight,
            padding: style(a).padding,
            radius: style(a).borderRadius,
            current: a.getAttribute("aria-current"),
          }));
          const active = tabs?.querySelector('[aria-current="page"]');
          const first = document.querySelector("a[href],button,input");
          return {
            headers: headers.length,
            repo: header.hasAttribute("data-repo-band"),
            header: rect(header),
            row: rect(row),
            padding: style(row).padding,
            background: style(header).backgroundColor,
            color: style(header.querySelector('a[href="/"]')).color,
            mark: style(header.querySelector("svg")).color,
            line: style(tabs ?? header).boxShadow,
            first: first.getAttribute("href"),
            main: document.querySelector("main").id,
            scrollWidth: document.documentElement.scrollWidth,
            crumb: crumb ? { box: rect(crumb), links: links(crumb) } : null,
            search: input ? {
              box: rect(input),
              q: input.value,
              action: input.form.getAttribute("action"),
              audience: input.form.elements.audience.value,
              label: input.getAttribute("aria-label"),
              placeholder: input.placeholder,
              hasIcon: Boolean(input.closest("search").querySelector("svg[aria-hidden='true']")),
            } : null,
            tabs: tabs ? {
              box: rect(tabs),
              padding: style(tabs).padding,
              links: links(tabs).filter((a) => a.box.width > 0),
              active: active?.textContent,
              underline: active ? {
                height: getComputedStyle(active, "::after").height,
                bottom: getComputedStyle(active, "::after").bottom,
                color: getComputedStyle(active, "::after").backgroundColor,
              } : null,
              menu: [...tabs.querySelectorAll("button")].some((el) => el.getBoundingClientRect().width > 0),
            } : null,
          };
        });
        const where = `${name} ${width} ${mode}`;
        assert(facts.headers === 1, `${where} has one header`);
        assert(facts.header.width === width && facts.header.x === 0, `${where} full-width header`);
        assert(facts.row.height === 64 && facts.padding === "0px 16px", `${where} 64px bar with 16px gutters`);
        assert(facts.scrollWidth <= width, `${where} no sideways scroll`);
        assert(facts.first === "#main" && facts.main === "main", `${where} skip link and main`);
        assert(facts.background === (mode === "light" ? "rgb(246, 248, 250)" : "rgb(1, 4, 9)"), `${where} inset background`);
        const foreground = mode === "light" ? "rgb(31, 35, 40)" : "rgb(240, 246, 252)";
        assert(facts.color === foreground && facts.mark === foreground, `${where} default foreground`);
        assert(facts.line.includes("inset") && facts.line.includes("-1px"), `${where} inset bottom line`);
        if (name === "home") {
          assert(!facts.repo && !facts.crumb && !facts.search && !facts.tabs, `${where} plain bar`);
        } else {
          const owner = name === "design-agent" ? "langchain-ai" : "hearthware";
          const repo = name === "design-agent" ? "design-agent" : "tally";
          assert(facts.repo && facts.header.height === 112, `${where} two-row repo header`);
          assert(facts.crumb.links[0].label === owner && facts.crumb.links[1].label === repo, `${where} canonical crumb`);
          assert(facts.crumb.links[0].href === `https://github.com/${encodeURIComponent(owner)}`, `${where} owner href`);
          assert(facts.crumb.links[1].href === `/${owner}/${repo}?audience=eng`, `${where} repo href`);
          for (const [index, link] of facts.crumb.links.entries()) {
            assert(link.box.height === 32 && link.padding === "4px 6px" && link.fontSize === "14px", `${where} crumb dimensions`);
            assert(link.weight === (index === 0 ? "400" : "600"), `${where} crumb weights`);
            assert(link.target === "", `${where} same-tab crumb`);
          }
          const door = name === "door" || name === "design-agent";
          assert(Boolean(facts.search) === !door, `${where} search only below the door`);
          if (facts.search) {
            const search = facts.search;
            assert(search.box.height === 32 && search.box.right === width - 16, `${where} search at right gutter`);
            assert(search.box.width === (width < 640 ? 128 : 272) && search.hasIcon, `${where} GitHub-style search dimensions and icon`);
            assert(search.box.top === 16 && search.box.left >= facts.crumb.box.right, `${where} search and crumb do not overlap`);
            assert(search.action === `/${owner}/${repo}/search` && search.audience === "eng", `${where} search action`);
            assert(search.q === (name === "search" ? "bill" : ""), `${where} URL query prefill`);
            assert(search.placeholder === "Topics, decisions, changes, files", `${where} placeholder`);
            assert(search.label === "Search topics, decisions, changes, files, and people", `${where} search label`);
          }
          assert(facts.tabs.box.width === width && facts.tabs.box.height === 48, `${where} full-width 48px tabs`);
          assert(facts.tabs.padding === "8px 16px 0px", `${where} tab gutters`);
          const labels = facts.tabs.links.map((link) => link.label);
          const expected = width < 1280 ? ["Wiki", "Timeline"] : ["Code", "Issues", "Pull requests", "Actions", "Projects", "Wiki", "Timeline", "Security and quality", "Insights"];
          assert(JSON.stringify(labels) === JSON.stringify(expected), `${where} unchanged fold rule`);
          assert(facts.tabs.menu === (width < 1280), `${where} folded GitHub menu`);
          assert(facts.tabs.active === (name === "timeline" ? "Timeline" : "Wiki"), `${where} active tab`);
          assert(facts.tabs.underline.height === "2px" && facts.tabs.underline.bottom === "-8px", `${where} bottom-edge underline`);
          assert(facts.tabs.underline.color === (mode === "light" ? "rgb(253, 140, 115)" : "rgb(247, 129, 102)"), `${where} active underline color`);
          for (const link of facts.tabs.links) {
            assert(link.box.height === 32 && link.padding === "6px 8px" && link.fontSize === "14px" && link.radius === "6px", `${where} tab item dimensions`);
            assert(link.target === "", `${where} same-tab tabs`);
            if (!["Wiki", "Timeline"].includes(link.label)) assert(link.href.startsWith(`https://github.com/${owner}/${repo}`), `${where} GitHub exit`);
          }
        }
        if (width === 1400 || width === 390) {
          const file = `${config.output}/${config.prefix}-${name}-${width}-${mode}.png`;
          await page.screenshot({ path: file });
          screenshots.push(file);
        }
        pages++;
      }
    }
  }
  await page.goto(`${config.base}/hearthware/tally/topics/root`);
  await page.locator("[data-repo-band-skeleton]").waitFor({ state: "detached" });
  const header = page.locator("[data-repo-band]:visible");
  await header.waitFor();
  await header.evaluate((el) => {
    window.headerBefore = el;
    el.dataset.persisted = "repo-header-check";
  });
  await page.getByRole("navigation", { name: "Repository", exact: true }).getByRole("link", { name: "Timeline", exact: true }).click();
  await page.waitForURL("**/hearthware/tally/timeline?audience=eng");
  assert(await header.evaluate((el) => el === window.headerBefore), "header survives Timeline navigation");
  const search = page.locator('[data-repo-band] input[name="q"]:visible');
  await search.fill("bill");
  await search.press("Enter");
  await page.waitForURL("**/hearthware/tally/search?audience=eng&q=bill");
  assert(await search.inputValue() === "bill", "search keeps submitted query");
  assert(await header.evaluate((el) => el === window.headerBefore), "header survives search submission");
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "tally", exact: true }).click();
  await page.waitForURL("**/hearthware/tally?audience=eng");
  assert(await search.count() === 0, "door hides global search after client navigation");
  assert(await header.evaluate((el) => el === window.headerBefore), "header survives return to door");
  await page.getByRole("button", { name: "GitHub", exact: true }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  const exits = await menu.locator("a").evaluateAll((links) => links.map((a) => ({ href: a.href, target: a.target })));
  assert(exits.length === 7 && exits.every((a) => a.href.startsWith("https://github.com/hearthware/tally") && a.target === ""), "folded menu keeps seven same-tab GitHub exits");
  await page.keyboard.press("Escape");
  for (const path of ["/hearthware/tally/search?audience=invalid", "/hearthware/tally/no-such-view"]) {
    const response = await page.goto(`${config.base}${path}`);
    assert([400, 404].includes(response.status()), `${path} keeps refusal status`);
    await page.locator("header:visible").waitFor();
    assert(await page.locator("header:visible").count() === 1, `${path} keeps a standalone bar`);
    assert(await page.locator("[data-repo-band]:visible").count() === 0, `${path} shows no repo controls`);
  }
  let skeletons = 0;
  for (const mode of ["light", "dark"]) {
    for (const width of widths) {
      const context = await page.context().browser().newContext({
        javaScriptEnabled: false,
        colorScheme: mode,
        viewport: { width, height: 1000 },
      });
      try {
        const shell = await context.newPage();
        await shell.goto(`${config.base}/hearthware/tally/topics/root`);
        const shape = await shell.locator("[data-repo-band-skeleton]").evaluate((el) => ({
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
          inert: el.inert,
        }));
        assert(shape.width === width && shape.height === 112 && shape.inert, `streamed skeleton ${width} ${mode} matches the final shape and cannot take focus`);
        skeletons++;
      } finally {
        await context.close();
      }
    }
  }
  assert(errors.length === 0, `no browser exceptions: ${errors.join("; ")}`);
  return { result: "PASS", pages, skeletons, screenshots, persistence: true, submission: true, menu: true, refusals: true };
}

const session = `-s=${prefix}-header`;
try {
  command("playwright-cli", [session, "--raw", "open", config.base]);
  const result = command("playwright-cli", [session, "--raw", "run-code", `async page => (${checkHeader.toString()})(page, ${JSON.stringify(config)})`]);
  assert.match(result, /"result":\s*"PASS"/);
  console.log(result);
} finally {
  console.log(command("playwright-cli", [session, "--raw", "close"]));
}
