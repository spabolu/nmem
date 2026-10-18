# Paper plan: nmem at FSE 2027 Industry

## Target

FSE 2027 Industry Papers, long paper: 10 pages of text and figures plus 2 of references, ACM format
(`acmart`, `acmsmall,screen,review` as the FSE call asks; check the FSE 2027 format page before submitting).
Submission is due Sat Jan 23, 2027 AoE at https://fse2027-industry.hotcrp.com. Notification is Mar 20, 2027. Double-blind review is
optional. Reviewers weigh industrial application, improvement on the state of practice, lessons learned backed by data, and generality.

Companion, optional: the MSR 2027 Industry Track takes a one-page talk abstract, due Fri Dec 18, 2026 AoE
(https://msr2027-industry.hotcrp.com). Choose not to publish it in the proceedings, so the FSE paper stays clear of the
ACM prior-publication rule.

Venues ruled out on 2026-10-17. ICLR 2027 main closed Sep 25, 2026, and its reviewers expect a machine learning contribution.
MSR 2027 Technical Papers and ICSE 2027 SEIP close Oct 23, 2026, which is too soon for the human data below.

## The claim

Engineers ask a repository why something is the way it is. Tools that turn a repository into pages answer with fluent
text, and a missing reason gets invented. nmem recovers decisions from merged pull requests, their threads, and direct commits. Every
sentence it shows carries the record it came from. When nobody wrote a reason down, it says so and names who to ask.
It checks docs by running their examples, and it weighs which decisions are worth a reader's time. We report its
accuracy against human labels, its faithfulness against a plain model baseline, and what engineers did with it in an internal pilot.

## Research questions

- RQ1, decision recovery. How precisely and completely does nmem surface the decisions worth a reader's attention,
  against showing everything and against a single-prompt model baseline?
- RQ2, faithfulness. How often is a shown reason unsupported by its cited source? How often is "nobody wrote down
  why" correct, meaning a person finds no reason in the record? How do both compare with a baseline that always answers?
- RQ3, doc currency. How often is an "out of date" flag right, by a person's reading of the doc and the code?
- RQ4, practice. In the pilot, do engineers answer history questions more accurately or faster with nmem than with
  GitHub alone? Where did they trust a wrong answer, and what did they ask for?
- RQ5, cost. Model calls, tokens, and wall time per change, and time to the first useful page.

## Evidence we have, and what each needs before it can go in the paper

| Evidence | Where | Status |
| --- | --- | --- |
| Decision key, 210 items, 6 repos, dev and held-out split | `harness/decisions-gold/` | Labelled by two models (Opus, Grok), with model adjudication of 26 disagreements. Needs human labels. The held-out split is spent |
| Weigh step result, held-out precision 85.7%, recall 81.8% | `node harness/decisions-real.mjs ~/.cache/nmem/repos --held-out` | Reproduces today. Must be rescored on human labels and a fresh held-out sample |
| Synthetic fixture repos with planted answer keys | `fixtures/generate.mjs --check`, `harness/` | Usable for faithfulness ("fabricated none") and currency. Describe as controlled checks, not the main result |
| Build cost and time on 11 repos in 10 languages | `docs/pilot.md` table, build logs | Usable. Cache state differs across rows, so report calls and tokens, and give minutes only from cold runs |
| End-to-end and layout checks | `harness/pilot-e2e.mjs`, `harness/ui-sweep.mjs` | Engineering evidence for the artifact section, not a result |
| Pilot user data | none yet | Needs the protocol in `study.md` |

## Work to do, with owners

Human work (the owner arranges it):

1. Two human labellers, not the authors of the engine prompts. They relabel the 210 items blind to the model labels,
   using `RUBRIC.md`. Agreement is reported as Cohen's kappa, and disagreements are settled by discussion.
2. A fresh held-out sample: 35 decisions each from four repos never used in tuning, labelled the same way. Candidates
   are pallets/click, JamesNK/Newtonsoft.Json, BurntSushi/walkdir, and vlucas/phpdotenv (all built).
3. Faithfulness labels: 100 sampled "why" lines and 100 sampled "nobody wrote down why" entries. A labeller marks each
   as supported, unsupported, or a reason the record had that nmem missed. The baseline answers on the same items are mixed in, unmarked.
4. Pilot participants: 8 to 12 engineers, each with written consent. Check whether the company needs an internal review
   for studies with employees. ACM's policy on research with human participants applies to the paper.
5. Deployment decision: the pilot needs a shared server with sign-in, or VPN-only access. This is still open in the backlog.

Engineering work (the agent):

1. Baseline B1: one model prompt per merged change that lists the decisions and their reasons, with no grounding check
   and no weigh step, on the same models. It is scored on the same keys.
2. A labelling tool that shows one item, its source, and the rubric, and writes JSONL. It hides which system produced an item.
3. Pilot instrumentation: per-task timing, the answer given, and the pages visited, stored locally with consent.
4. Analysis scripts that turn every table and figure into a command over committed data, listed in `claims.md`.
5. The paper in `docs/paper/main.tex`, built with the ACM template.

## Timeline (weeks start Monday)

| Week | Work |
| --- | --- |
| Oct 19 | Plan, study protocol, claims ledger, outline (this week). Owner: recruit labellers and participants, settle the deployment |
| Oct 26 | Labelling tool, baseline B1, fresh sample drawn. Labellers start on the 210 |
| Nov 2 | Human labels on the 210 done. Fresh sample labelled. RQ1 rescored. Faithfulness sample drawn |
| Nov 9 | Faithfulness labels. Pilot instrumentation and dry run with one engineer |
| Nov 16 to Dec 11 | Pilot runs four weeks. RQ2, RQ3, and RQ5 analysis in parallel |
| Dec 14 | Pilot analysis. First full draft. MSR talk abstract submitted Dec 18 if wanted |
| Dec 21 to Jan 8 | Holiday slack. Internal review of the draft |
| Jan 11 | Revise. Every number checked against `claims.md`, every reference checked by a person against its source |
| Jan 18 | Final read, PDF checks, submit by Jan 22 to leave a day |

## Rules for the writing

- Every number in the paper has a row in `claims.md` with the command that reproduces it.
- Every reference is opened and read by a person before it goes in. A citation that cannot be checked is cut.
- The paper states how AI tools were used in writing and in the system, per ACM's authorship policy and the FSE call.
- Prior art the paper must discuss: repository wiki generators (DeepWiki, May 2025), LLM design-rationale generation
  (arXiv 2504.20781 and the work it cites), outdated-documentation detection (DOCER, ICSME 2023), and rationale in
  commit messages. A person reads each before we characterise it.
