# Wayfinder gold: reconciling two reviews

Two models reviewed wayfinder's gold on 2026-10-12: claude-opus-5.5 and gpt-6.1-sol. Both agreed on all 14 currency verdicts. This page lists every item either one disputed or said gold missed, plus the notes on agreed items that led to a change. For each item it gives the verdict and the evidence in the record (`out/wayfinder/repo` and `out/wayfinder/github.json`). Where a reviewer claimed behavior, the code was run. The record decides each item. Neither model's opinion does. The owner delegated this reconciliation and the two signatures to the agent on 2026-10-12.

Result: 12 items fixed in gold, 11 rejected, and all 12 disputed fact sets fixed, plus one flagged set a reviewer called minor. Public output (repo SHAs, `github.json`, `answer-key.json`, the answer-key pages, `noise.json`, `manifest.json`) is byte-identical to before. Gold gains two decisions, one finding, one still-true claim, and two runs.

## The rule, applied to every change

A change whose PR or commit states a choice with intent carries a decision, and the decider is the author of the intent. A change gets a finding only for behavior the record does not state, or for a cost its PR did not weigh. A behavior that no setup in the record reaches gets no finding: one that needs a caller-written store or key function, two limiters in one app, or middleware calls started in the same tick. The same reasoning makes `clock.md` out of date on Node 18, which `package.json` declares supported, and leaves ADR-0004's outage line true.

| change | choice the record states | decision | finding |
| --- | --- | --- | --- |
| 0bb1864 | none | none | routine |
| PR #1 | one process, client IP, wall-clock window; ADR-0001 | d-fixed-window | none |
| 768a9b9 | fix window off-by-one | d-window-bound | none |
| 08fd6c2 | none | none | routine |
| PR #2 | a store interface | d-store-interface | none |
| ef52cf1 | default the key to the API key | d-api-key | none |
| PR #4 | a Redis store, failing closed; ADR-0002 | d-redis, d-fail-closed | none |
| PR #5 | a token bucket, both stores saving tokens and a timestamp; ADR-0003 | d-bucket | none |
| 520c2a0 | none, a reviewer list | none | routine |
| a62cc2d | none | none | routine |
| 8635c79 | don't 429 on a Redis blip | d-fail-open | none |
| 5f4bea4 | revert it | d-revert-fail-open | none |
| PR #11 | drop Redis, memory only, no switch; ADR-0004 | d-in-process, d-no-switch | none |
| PR #13 | headers, a reject counter, a whole non-negative Remaining | d-retry-headers, d-metrics, d-whole-remaining | none |
| 3311836 | none | none | routine |
| PR #15 | none (guides only) | none | routine |
| PR #16 | rename windowMs | d-rename | f-double, f-rename (Behavior change), f-reset (Worth a look) |
| PR #17 | a clock step helper | d-clock-step | f-clock-split (Worth a look) |
| PR #18 | round retry waits to the step | d-round-retry | f-round-unused (Worth a look) |
| aedc535 | none | none | routine |

Four decisions have no carrying change because they were agreed in a thread: d-per-route, d-cluster, d-no-shared-db, and d-no-new-service.

## Fixed

1. **Every key gets twice the limit, not only a new one (Claude, GPT).** PR #16 passes `options.limit * 2` to `take()` as its capacity, and `take()` refills at `capacity / refillWindowMs`. A probe at aedc535 with limit 2 and a 1000 ms window gave `200 200 200 200 429` for a new key, and the same again one window later. Sending one request every 50 ms for 10 s let 44 through at aedc535 and 21 at ad30eda, before PR #16. A new run, `double-every-key`, shows the drained key's second burst. f-double is renamed "Every key gets twice the limit", and the counting headline cites the run.
2. **Replies say more is left than the limit (Claude, GPT).** `rateLimitHeaders()` gets the configured limit and the doubled bucket's balance. The same run prints `first reply: RateLimit-Limit 2, RateLimit-Remaining 3`. At ad30eda it is 1. f-double's second card point says so, and f-double now sits on the replies topic, so the replies timeline for Nov 19 counts one behavior change and one thing to check.
3. **"Five requests at once" (GPT).** test/limit.test.ts awaits each request with the clock fixed at 5000. The root and counting examples now say the five go one after another with no time passing. The concurrency claim behind this point is rejected below.
4. **The metrics plain headline (Claude, GPT).** "Each decision is counted when the app using the limiter asks for counts" read as counting on `snapshot()`. `src/limit.ts` calls `options.metrics?.record(decision.allowed)` on every request. The text now says every request is counted once the app turns counting on.
5. **"Each allowing 2" (GPT).** The two-limiter run configures limit 2, and each limiter admits 4. The plain reasons of claim-exceed-guide, claim-exceed-readme, and claim-adr-exceed now say "set to allow 2". They also name limiters that keep their own counts, not copies of the service, because the run is two limiters in one process. The stores example says the same.
6. **The README claim's reason left out the ratio (Claude).** README predicts about twice the limit with two processes, and the run gives 8 at limit 2. Both audiences now say four times the limit.
7. **d-bucket's plain reason (Claude).** "Both sides of each block of time" meant both sides of the line between two blocks. PR #5 says "both sides of a window boundary". The text now says just before and just after one block gives way to the next.
8. **d-store-interface's plain text (Claude).** "Storage became its own separate step" did not describe an interface. A first rewrite said "counts", which PR #2 never mentions, and calibration caught it. It now says storage was moved behind a fixed shape any store can follow.
9. **PR #13's clamp is a decision (GPT, Claude).** Commit 4018401 states "clamp RateLimit-Remaining to a non-negative integer", as d-rename is a sentence in PR #16's body. Both reviewers named Mira Chen as decider. The record shows Jon Okonkwo first: his test in 4a1293f is titled "remaining is a non-negative integer", and his comment 1200348531 at 18:05 says "I will clamp it." Mira's review asking for the same came at 19:10. d-whole-remaining is carried by PR #13 with the commit as intent. Its recorded reason is the CI failure, "Expected remaining 1, got 1.7.", so it now covers `ci-caught-remaining`, which leaves the uncovered list.
10. **PR #17 states its own choice (GPT, Claude).** "Add clockStepMs so a later change can round waits to a step." was an alternative intent of d-round-retry, which left PR #17 carrying no decision (Claude). d-clock-step is carried by PR #17, with that body as intent and reason and the commit "add a clock step helper" as a second intent. d-round-retry keeps PR #18's title and commit. It is listed first, so a same-day tie names PR #18's decision as the newer one.
11. **PR #18's rounding reaches no reply (Claude).** PR #18 is titled "Round retry waits to the clock step", and the review says "Rounding looks right." A new run, `rounding-unused`, prints `the package exports roundRetryMs: no` and `files in src besides retry.ts that use roundRetryMs: none`. `src/limit.ts` still sends `Math.ceil(decision.retryAfterMs / 1000)` seconds. f-round-unused is a Worth a look finding with no recorded reason (ask Jon Okonkwo). d-round-retry stays, because the choice was stated.
12. **PR #5 belongs on stores (Claude).** Both accepted intents of d-bucket name the stores: PR #5's "Both stores now save tokens and a timestamp." and ADR-0003's Decision. PR #5 rewrote `src/store.ts`. d-bucket and PR #5 now list stores.

Screens moved by these fixes were recomputed by hand, and the generator matched all 18: root over the whole life (21 decisions, 2 behavior changes, 3 things to check, naming f-round-unused), stores (11 decisions), clock (2 decisions, 2 things to check), Nov 20 to Dec 12 (3 decisions, 2 things to check), and replies on Nov 19.

## Rejected

1. **PR #2 lets concurrent requests lose updates, so "ten concurrent requests all pass" (GPT).** True only when code calls the middleware several times in one tick. `Promise.all` over ten direct calls at aedc535 gives ten 200s. The memory store's `read` and `write` settle as microtasks, and Node drains microtasks between I/O callbacks, so requests that arrive over HTTP never interleave. Through a real HTTP server, 200 concurrent requests let exactly 4 through at aedc535 (five runs) and exactly 2 at 7a2587f (three runs). No finding, and the counting bound and root example stand once reworded (fix 3).
2. **PR #2 stops limiters in one process from sharing counts (GPT).** Real: two limiters in one process share the module Map at 768a9b9 (`200 200 429 | 429 429 429`) and do not at 7a2587f (`200 200 429 | 200 200 429`). But the record never runs two limiters in one app. The README shows one `createLimiter` call, and every doc frames sharing by process. Listed under Left open.
3. **Fail-closed landed silently in PR #2, so d-fail-closed is misdated (Claude).** 7a2587f's `catch` returns 429, but memory was the only store at PR #2, and it cannot throw. The choice was first stated in PR #4 ("If Redis throws, the limiter still returns 429."), which also brought the first store that can fail. d-fail-closed stays on PR #4.
4. **d-window-bound belongs on counting (Claude, GPT).** It does, in meaning. But c-fix-bound touches only `src/window.ts` and `test/window.test.ts`, neither at HEAD. Topic files must be HEAD files (`fixtures/lib/views.mjs` line 579), a change can join only a topic whose files it touched (line 622), and a decision's topics must be its carrier's (line 449). The spec cannot express it. Listed under Left open.
5. **d-window-bound's text is vague (Claude).** Its one source is the commit subject "fix window off-by-one". The reason, from Jon's review comment, carries the specifics.
6. **PR #1 belongs on callers (Claude).** ADR-0001, an accepted intent of d-fixed-window, says "The caller passes a key string. The example uses the client IP." The client IP is an example there, so not every intent supports keying as part of the decision. d-api-key carries the key's history on the callers page.
7. **ADR-0004's "A store outage can no longer take the API down." depends (GPT).** A caller-written store that throws still gets 429 for every request (the catch at `src/limit.ts`). But `stores.md` and the ADR say `createMemoryStore` is the only store, the README documents no `store` option, and `src/index.ts` exports no store type. The sentence is now a still-true guard, claim-adr-outage, so a system that marks it depends is scored on it.
8. **Gold misses true ADR and guide sentences (GPT).** "retryAfterMs is how long until one token is back", "The stored value is no longer a plain counter", "Each process keeps its own buckets", "Limits are approximate when more than one process is running", "Tests and production use the same store code", and the four steps in `limits.md` are all true at HEAD (`src/bucket.ts`, `src/store.ts`). Gold lists sentences that are not plainly true, plus guards.
9. **The metrics topic should state the alert gap (GPT).** The headline already says counts stay in memory and are recorded only when the caller passes metrics in. The alert gap is d-no-new-service, shown on the same page with Mira's reason.
10. **claim-clock-caller dates the rounding Nov 21 (Claude).** The sentence names the commit's own day, which is what the `introduced` proof shows. The claim's `since` is PR #18, live Nov 22.
11. **The clock topic's plain grep headline should say nothing calls the rounding (Claude).** It stays as written. f-round-unused now says it on the clock timeline with a run as its source.

## Fact sets

Facts were refrozen for the 29 changed fields in two passes (grok-4.7 extracting, gpt-5.5 cross-checking, 11 live calls). Every refrozen set and every set either reviewer disputed was read against its gold sentence. Set numbers are from the sheet the reviewers saw. The disputed sets 25, 27, 31, and 35 were refrozen with their new gold text. These were fixed by hand and marked owner-checked:

- Paraphrases that changed the meaning: a test called a "built-in review" (24, and f-double's plain card), a closed PR called a shut adapter (28), code called storage (29), "per second" for a duration (30), memory kept "only for the current run" (32), "might" for "would" (42), "when counting starts over" (45), and "permitting 2" for a configured allowance (the three two-limiter claims and the stores example). The d-bucket engineer paraphrase (26) no longer reorders the reason.
- Headline marks: the wait time in d-retry-headers' plain text (45), both halves of d-no-switch (29), the result in d-whole-remaining's reasons, and the partner fact in d-bucket's plain reason, which is now supporting as in the engineer set.
- Garbled facts: "This count is from the code" (50) and f-double's "The check was tried".

Every wayfinder paraphrase keeps the freeze rules (no shared 6-gram with its object's gold text, length, plain words). After the fixes, no wayfinder set is flagged, and the 20 drawn at random in `facts.md` were read and are right.

Calibration on wayfinder first failed on two sentences whose one source did not hold them: d-store-interface's plain "counts" and f-round-unused's plain grep point. Both were fixed in gold, never in the judge. It then passed with 7 live calls (bands 32/32, usable 44/44, corruptions 84/84, invariants 60/60, paraphrase 20/20, leaks 3/3, retest 3/3, stamp dcd4726f before signing). After signing, with no live calls: wayfinder stamp fa23787b, final; tally and wayfinder stamp 382e46bd, final; tally alone stamp 35877607, open only on the case floors.

## Left open

- d-window-bound sits on the root page alone. Fixing it needs a generator rule for changes confined to files deleted before HEAD.
- PR #2 changed two things it never stated: limiters in one process stopped sharing counts, and any thrown error became a 429. Neither reaches a setup the record has. The owner may promote either to a finding.
- Between PR #4 and PR #11, `createRedisStore` read and wrote the counter in two round trips, so concurrent requests across processes could lose updates. This is inferred from the code at 0b5d8a8 and was not run. Neither reviewer raised it, and the code is gone at HEAD.
- `answer-key.json` entries why-burst-gap and assist-behavior speak of a new key's starting allowance, which is narrower than PR #16's effect. They were not changed, to keep public output byte-identical.
- `currency.json` and `facts.json` hold one reviewer for every repo. Wayfinder's signature is the same as tally's, so no per-repo split was needed. A repo signed by someone else would need one.
