// `node --test` and the client band both load this file, so it imports no @/ alias, server-only, or fs.

export type PathRest = "none" | "topic" | "item+";

export type HarnessView = "door" | "topics" | "timeline" | "other" | "source";

export type RouteSpec = {
  readonly segment: string | null;
  readonly path: PathRest;
  readonly statics: readonly string[];
  readonly queryRefs: readonly ("topic" | "item")[];
  readonly layout: "wide" | "pages";
  readonly view: HarnessView;
};

export const ROUTES = {
  door: {
    segment: null,
    path: "none",
    statics: [],
    queryRefs: [],
    layout: "wide",
    view: "door",
  },
  topics: {
    segment: "topics",
    path: "topic",
    statics: [],
    queryRefs: [],
    layout: "pages",
    view: "topics",
  },
  items: {
    segment: "items",
    path: "item+",
    statics: [],
    queryRefs: [],
    layout: "pages",
    view: "topics",
  },
  search: {
    segment: "search",
    path: "none",
    statics: ["hits"],
    queryRefs: [],
    layout: "pages",
    view: "other",
  },
  timeline: {
    segment: "timeline",
    path: "none",
    statics: [],
    queryRefs: ["topic", "item"],
    layout: "wide",
    view: "timeline",
  },
  source: {
    segment: "source",
    path: "none",
    statics: [],
    queryRefs: [],
    layout: "wide",
    view: "source",
  },
} as const satisfies Record<string, RouteSpec>;

export type RouteKey = keyof typeof ROUTES;

export type BareRoute = {
  [K in RouteKey]: (typeof ROUTES)[K]["path"] extends "none" ? K : never;
}[RouteKey];

export type RouteMatch = {
  readonly route: RouteKey;
  readonly rest: readonly string[];
};

function specOf(route: RouteKey): RouteSpec {
  return ROUTES[route];
}

export function matchRoute(segments: readonly string[]): RouteMatch | null {
  if (segments.length === 0) return { route: "door", rest: [] };
  const [head, ...rest] = segments;
  const route = (Object.keys(ROUTES) as RouteKey[]).find(
    (key) => ROUTES[key].segment === head,
  );
  if (!route) return null;
  const spec = specOf(route);
  if (spec.path === "none") {
    if (rest.length === 0) return { route, rest };
    if (rest.length === 1 && spec.statics.includes(rest[0] ?? "")) {
      return { route, rest };
    }
    return null;
  }
  if (spec.path === "topic" && rest.length > 1) return null;
  return { route, rest };
}

export function routeOfSegment(segment: string | null): RouteKey {
  if (segment === null) return "door";
  const route = (Object.keys(ROUTES) as RouteKey[]).find(
    (key) => ROUTES[key].segment === segment,
  );
  return route ?? "door";
}

export function segmentPath(route: RouteKey): string {
  const { segment } = ROUTES[route];
  return segment === null ? "" : `/${segment}`;
}

export function isPageBelowDoor(segments: readonly string[]): boolean {
  const match = matchRoute(segments);
  if (!match || match.route === "door") return false;
  const spec = specOf(match.route);
  return !match.rest.some((part) => spec.statics.includes(part));
}

export type Book = {
  hasTopic(id: string): boolean;
  hasItem(id: string): boolean;
};

export type Refusal = { readonly status: 404; readonly reason: string };

export function refusalFor(
  book: Book,
  segments: readonly string[],
  query: { readonly topic: string | null; readonly item: string | null },
): Refusal | null {
  const match = matchRoute(segments);
  if (!match) {
    return {
      status: 404,
      reason: "Nothing at this address is in the snapshot.",
    };
  }
  const spec = specOf(match.route);
  if (spec.path === "topic") {
    const id = match.rest[0];
    if (id === undefined || !book.hasTopic(id)) {
      return { status: 404, reason: `The snapshot has no topic ${id ?? ""}.` };
    }
  }
  if (spec.path === "item+") {
    const item = match.rest.join("/");
    if (!book.hasItem(item)) {
      return {
        status: 404,
        reason:
          item === "" ? "Pick an item." : `The snapshot has no item ${item}.`,
      };
    }
  }
  for (const ref of spec.queryRefs) {
    const value = query[ref];
    if (!value) continue;
    const known = ref === "topic" ? book.hasTopic(value) : book.hasItem(value);
    if (!known) {
      return { status: 404, reason: `The snapshot has no ${ref} ${value}.` };
    }
  }
  return null;
}
