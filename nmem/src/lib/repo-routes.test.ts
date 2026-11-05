import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  isPageRoute,
  matchRoute,
  ROUTES,
  refusalFor,
  routeOfSegment,
  segmentPath,
} from "./repo-routes.ts";
import { TABS, tabOfRoute } from "./repo-tabs.ts";

const book = {
  hasTopic: (id: string) => id === "root",
  hasItem: (id: string) => id === "file/.gitignore",
};

test("app folders and route segments are the same set", () => {
  const root = new URL("../app/[owner]/[repo]/", import.meta.url);
  const dirs = readdirSync(fileURLToPath(root), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const segments = Object.values(ROUTES)
    .flatMap((route) => (route.segment === null ? [] : [route.segment]))
    .sort();
  assert.deepEqual(dirs, segments);
  for (const route of Object.values(ROUTES)) {
    for (const extra of route.statics) {
      assert.equal(
        existsSync(fileURLToPath(new URL(`${route.segment}/${extra}`, root))),
        true,
      );
    }
  }
});

test("each route lights at most one tab, and an nmem tab owns its home", () => {
  for (const route of Object.keys(ROUTES)) {
    const owners = TABS.filter(
      (tab) =>
        tab.owner === "nmem" && tab.owns.some((owned) => owned === route),
    );
    assert.ok(owners.length <= 1, route);
  }
  for (const tab of TABS) {
    if (tab.owner !== "nmem") continue;
    assert.ok(
      tab.owns.some((owned) => owned === tab.home),
      tab.key,
    );
    assert.equal(tabOfRoute(tab.home), tab.key);
  }
  assert.equal(tabOfRoute("source"), null);
  assert.equal(tabOfRoute("door"), "wiki");
  assert.equal(tabOfRoute("topics"), "wiki");
  assert.equal(tabOfRoute("items"), "wiki");
  assert.equal(tabOfRoute("search"), "wiki");
  assert.equal(tabOfRoute("timeline"), "timeline");
});

test("github tabs keep GitHub's paths and are never current here", () => {
  const paths = Object.fromEntries(
    TABS.filter((tab) => tab.owner === "github").map((tab) => [
      tab.key,
      tab.ghPath,
    ]),
  );
  assert.deepEqual(paths, {
    code: "",
    issues: "/issues",
    pulls: "/pulls",
    actions: "/actions",
    projects: "/projects",
    security: "/security",
    insights: "/pulse",
  });
});

test("segment lookup matches the layout hook and the URL builder", () => {
  assert.equal(routeOfSegment(null), "door");
  assert.equal(routeOfSegment("topics"), "topics");
  assert.equal(routeOfSegment("nope"), "door");
  assert.equal(segmentPath("door"), "");
  assert.equal(segmentPath("topics"), "/topics");
  assert.equal(segmentPath("timeline"), "/timeline");
});

test("refusalFor keeps the built-repo status rules", () => {
  const none = { topic: null, item: null };
  assert.equal(refusalFor(book, [], none), null);
  assert.equal(refusalFor(book, ["topics", "root"], none), null);
  assert.equal(refusalFor(book, ["topics", "nope"], none)?.status, 404);
  assert.equal(refusalFor(book, ["topics"], none)?.status, 404);
  assert.equal(
    refusalFor(book, ["topics", "root", "extra"], none)?.status,
    404,
  );
  assert.equal(refusalFor(book, ["items", "file", ".gitignore"], none), null);
  assert.equal(refusalFor(book, ["items", "nope"], none)?.status, 404);
  assert.equal(refusalFor(book, ["items"], none)?.reason, "Pick an item.");
  assert.equal(refusalFor(book, ["search"], none), null);
  assert.equal(refusalFor(book, ["search", "hits"], none), null);
  assert.equal(refusalFor(book, ["search", "other"], none)?.status, 404);
  assert.equal(refusalFor(book, ["timeline"], none), null);
  assert.equal(
    refusalFor(book, ["timeline"], { topic: "nope", item: null })?.status,
    404,
  );
  assert.equal(
    refusalFor(book, ["timeline"], { topic: null, item: "nope" })?.status,
    404,
  );
  assert.equal(refusalFor(book, ["source"], none), null);
  assert.equal(refusalFor(book, ["bogus"], none)?.status, 404);
  assert.equal(matchRoute(["topics", "root"])?.route, "topics");
});

test("unbuilt redirects cover view pages and leave the hits endpoint alone", () => {
  assert.equal(isPageRoute(["timeline"]), true);
  assert.equal(isPageRoute(["topics", "nope"]), true);
  assert.equal(isPageRoute(["items", "file", "a"]), true);
  assert.equal(isPageRoute(["search"]), true);
  assert.equal(isPageRoute(["source"]), true);
  assert.equal(isPageRoute(["search", "hits"]), false);
  assert.equal(isPageRoute(["bogus"]), false);
  assert.equal(isPageRoute([]), false);
});
