# Outline (10 pages plus 2 of references)

Working title: Recovering the Why Without Inventing It: Grounded Decision Recovery from Repository History in Practice

| Section | Pages | Content |
| --- | --- | --- |
| 1 Introduction | 1 | An engineer asks why the code is the way it is. Commit messages and PR threads hold part of the answer, scattered. Tools that turn a repo into readable pages give a fluent answer, including when the record has none. Our contributions: a grounded pipeline, an honest-gap output, evidence on 11 repos and in an internal pilot, and lessons learned |
| 2 Context and related work | 1 | Rationale research in SE (rationale in commits and threads, design-decision mining). Repo wiki generators. Outdated-doc detection. What none of them do: refuse to show an unsourced reason. Every citation is read by a person first |
| 3 nmem | 2 | The data shape: change, decision, why (recorded or not recorded with who to ask), topic, doc claim, source. The pipeline: fetch, classify, link, why, weigh, place, prove docs by running examples. The source check that rejects text the record does not support. The worker, the first-pages snapshot, and the app |
| 4 Evaluation design | 1 | RQ1 to RQ5. The keys: human relabel of 210, a fresh held-out sample of 140, synthetic fixtures with planted answers. Baselines: show everything, and one prompt per change. Pilot protocol (study.md) |
| 5 Results | 3 | RQ1 precision and recall with intervals, per repo and language. RQ2 unsupported-reason rate and correct "not recorded" rate, against the baseline. RQ3 currency flags. RQ4 pilot accuracy, time, confident-and-wrong counts, themes. RQ5 cost and time |
| 6 Lessons learned | 1 | Candidates, kept only if the data backs them: fixture gains that did not carry to real repos (the anchor-name filter); quiet changes against "could not classify"; first pages within minutes change how people use it; honest gaps need a person to ask, which fails for bots and email-only commits |
| 7 Threats and limits | 0.5 | Small samples, one company, public repos only, model labels replaced late, cost |
| 8 Conclusion and artifact | 0.5 | Link to the code, keys, and scripts |
