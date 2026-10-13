/**
 * Vet: a second look at one finding before it reaches a page. Classify reads the whole change at once and sometimes
 * reports what its own record already dealt with, or code no person using the program can reach. This call sees the
 * change and the one finding, and only keeps or drops it.
 */
import type { Finding } from '../harness/contract.ts';
import type { ModelClient } from './copilot.ts';
import { dossierOf } from './classify.ts';
import { ask, lit, obj, OPUS } from './model.ts';
import type { Task } from './model.ts';
import type { Change, RepoRecord } from './record.ts';

type VetInput = { readonly change: string; readonly finding: Finding };

const VET: Task<VetInput, { readonly verdict: 'stands' | 'handled' | 'unreachable' }> = {
  id: 'vet-finding',
  version: 3,
  model: OPUS,
  maxOutputTokens: 600,
  rules: `Answer only by calling the answer tool, with no other text.

You check one finding about a change before a read-only history of a software project shows it. A finding is something in the change that a reader of the history would miss if they read only what the change says it chose. The change follows, then the finding.

Answer one verdict:
- handled: the record shows someone did something about it, such as doing the work by hand ("I updated the three deploy scripts myself.") or changing their own steps to avoid it. Words alone are not handling it: noticing it, reporting it, or calling the change fine is stands.
- unreachable: nobody using the program could ever notice it, because nothing they can do reaches that code.
- stands: otherwise.`,
  render: (input) => [
    input.change,
    '',
    'Finding:',
    `${input.finding.severity}: ${input.finding.name.eng}`,
    ...input.finding.says.map((said) => `- ${said.eng}`),
    `Anchor: ${input.finding.anchor.kind === 'record' ? input.finding.anchor.quote.replace(/\s+/g, ' ') : ''}`,
  ].join('\n'),
  answer: obj({ verdict: lit('stands', 'handled', 'unreachable') }),
};

/** True when the finding stands. */
export async function vetFinding(record: RepoRecord, client: ModelClient, change: Change, finding: Finding): Promise<boolean> {
  const input: VetInput = { change: dossierOf(record, change, []).text, finding };
  const vetted = await ask(client, VET, input, `vet ${change.id}: ${finding.name.eng}`, (answer) => ({ value: answer.verdict, problems: [] }));
  return vetted.value === 'stands';
}
