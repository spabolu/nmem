# Pilot study protocol (RQ4)

## Who

8 to 12 engineers from the internal pilot. Each one signs a consent form that names what is logged and how it is used.
Nobody who built nmem takes part. Participants are paid in work time, and their answers have no bearing on their reviews.

## Design

Within subjects and counterbalanced. Each participant does 8 timed tasks: 4 on repo A with nmem and 4 on repo B with
GitHub alone (its web UI, search, and blame), then the other way round for the next participant. A and B come from the
built public repos and are matched for size: pallets/click with JamesNK/Newtonsoft.Json, and walkdir with besticon.
Nobody gets a repo they have contributed to.

Each set of 4 holds one task of each kind:

| Kind | Example | Correct answer |
| --- | --- | --- |
| Recorded why | Why does click's `--help` no longer show `[default: False]`? | The reason in the PR or thread, with its link |
| Unrecorded why | Why did walkdir rename `WalkDirBuilder` to `WalkDir`? | Nobody wrote it down, and the person to ask |
| Doc currency | Does the README's claim about X still hold? | Yes or no, with the code that shows it |
| Find the change | When did X start behaving like Y, and in which change? | The change id |

Two authors write the answer key for every task from the record before the study, and agree on it. A task that they
cannot agree on is dropped.

## Measures

- Correctness, scored 0, 1, or 2 against the key by a scorer who does not know the condition.
- Time to answer, capped at 10 minutes per task. A timeout counts as wrong.
- Confidence from 1 to 5 after each answer. The key outcome is confident and wrong: confidence 4 or 5 on a wrong
  answer. It measures whether a tool misleads.
- For unrecorded-why tasks, whether the participant invented a reason.

## Free use and exit

After the timed tasks, two weeks of free use on public repos the participant picks. The app logs page views, searches,
and use of the feedback buttons (to be built). A 20 minute exit interview follows a fixed guide: what they used it for,
a time it helped, a time it was wrong, and what they would need to keep using it. Two authors code the interview
notes on their own, then reconcile them.

## Analysis

Paired comparisons per participant (Wilcoxon signed-rank on correctness and time), with effect sizes and the raw
counts reported next to them. With 8 to 12 people this is a case study, and the paper says so. Its weight sits on the
confident-and-wrong counts and on the interview themes, not on p-values.

## Dry run

One engineer, the week of Nov 9, to time the tasks and fix unclear wording. Dry-run data is not analysed.
