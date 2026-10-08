// Full file contents per commit. Named helpers so a later version cannot drift from an earlier one.
const gitignore = `__pycache__/
*.pyc
ledger.txt
ledger.db
ledger.json
*.db-journal
*.db-wal
*.db-shm
`;

const tallyPy = `import sys


def shares(cents, n):
    base, extra = divmod(cents, n)
    return [base + (1 if i < extra else 0) for i in range(n)]


def split_bill(payer, cents, names):
    lines = []
    for name, share in zip(names, shares(cents, len(names))):
        if name == payer:
            continue
        lines.append("%s owes %s %d cents" % (name, payer, share))
    return lines


def main(argv):
    if len(argv) != 3:
        print("usage: python tally.py payer cents name,name,name", file=sys.stderr)
        return 2
    payer, raw, joined = argv
    cents = int(raw)
    names = joined.split(",")
    if payer not in names:
        print("payer must be in the split", file=sys.stderr)
        return 2
    if cents < 0:
        print("cents must be zero or more", file=sys.stderr)
        return 2
    for line in split_bill(payer, cents, names):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
`;

const tallyPyKind = `import sys


def shares(cents, n):
    base, extra = divmod(cents, n)
    return [base + (1 if i < extra else 0) for i in range(n)]


def split_bill(payer, cents, names):
    lines = []
    for name, share in zip(names, shares(cents, len(names))):
        if name == payer:
            continue
        lines.append("%s owes %s %d cents" % (name, payer, share))
    return lines


def main(argv):
    if len(argv) != 3:
        print("usage: python tally.py payer cents name,name,name", file=sys.stderr)
        return 2
    payer, raw, joined = argv
    try:
        cents = int(raw)
    except ValueError:
        print("cents must be a whole number", file=sys.stderr)
        return 2
    names = joined.split(",")
    if payer not in names:
        print("payer must be in the split", file=sys.stderr)
        return 2
    if cents < 0:
        print("cents must be zero or more", file=sys.stderr)
        return 2
    for line in split_bill(payer, cents, names):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
`;

const initPy = (version) => `"""Split shared household expenses."""

__version__ = "${version}"
`;

const mainPy = `from tally.cli import main

raise SystemExit(main())
`;

const ledgerPy = (floor) => `def add_expense(balances, payer, cents, names):
${floor ? `    each = cents // len(names)
    for name in names:
        if name == payer:
            continue
        balances[name] = balances.get(name, 0) - each
        balances[payer] = balances.get(payer, 0) + each
` : `    base, extra = divmod(cents, len(names))
    for i, name in enumerate(names):
        share = base + (1 if i < extra else 0)
        if name == payer:
            continue
        balances[name] = balances.get(name, 0) - share
        balances[payer] = balances.get(payer, 0) + share
`}

def add_payment(balances, src, dst, cents):
    balances[src] = balances.get(src, 0) + cents
    balances[dst] = balances.get(dst, 0) - cents


def balances_for(rows):
    balances = {}
    for row in rows:
        if row["kind"] == "expense":
            add_expense(balances, row["payer"], row["cents"], row["split"])
        else:
            add_payment(balances, row["src"], row["dst"], row["cents"])
    return balances
`;

const ledgerNoPay = `def add_expense(balances, payer, cents, names):
    base, extra = divmod(cents, len(names))
    for i, name in enumerate(names):
        share = base + (1 if i < extra else 0)
        if name == payer:
            continue
        balances[name] = balances.get(name, 0) - share
        balances[payer] = balances.get(payer, 0) + share


def balances_for(rows):
    balances = {}
    for row in rows:
        add_expense(balances, row["payer"], row["cents"], row["split"])
    return balances
`;

const cliOnce = `import sys

from tally.ledger import add_expense


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) != 3:
        print("usage: python -m tally payer cents name,name,name", file=sys.stderr)
        return 2
    payer, raw, joined = argv
    try:
        cents = int(raw)
    except ValueError:
        print("cents must be a whole number", file=sys.stderr)
        return 2
    names = joined.split(",")
    if payer not in names:
        print("payer must be in the split", file=sys.stderr)
        return 2
    balances = {}
    add_expense(balances, payer, cents, names)
    for name in names:
        if name == payer:
            continue
        print("%s owes %s %d cents" % (name, payer, -balances.get(name, 0)))
    return 0
`;

function cliPy({ data, pay, settle, dollars, importName, guard }) {
  const lines = [
    'import argparse',
    'import sys',
    '',
    'from tally.ledger import balances_for',
    'from tally.store import load, save',
  ];
  if (settle) lines.push(`from tally.settle import ${importName || 'minimal_transfers'}`);
  lines.push('', 'def show(cents):');
  if (dollars) {
    lines.push(
      '    sign = "-" if cents < 0 else ""',
      '    cents = abs(cents)',
      '    return "%s$%d.%02d" % (sign, cents // 100, cents % 100)',
    );
  } else {
    lines.push('    return "%d cents" % cents');
  }
  lines.push(
    '',
    '',
    'def build_parser():',
    '    parser = argparse.ArgumentParser(prog="tally")',
    `    parser.add_argument("--data", default="${data}")`,
    '    sub = parser.add_subparsers(dest="cmd")',
    '    add = sub.add_parser("add")',
    '    add.add_argument("--date", required=True)',
    '    add.add_argument("--payer", required=True)',
    '    add.add_argument("--cents", type=int, required=True)',
    '    add.add_argument("--note", default="misc")',
    '    add.add_argument("--split", required=True)',
  );
  if (pay) {
    lines.push(
      '    pay = sub.add_parser("pay")',
      '    pay.add_argument("--date", required=True)',
      '    pay.add_argument("--from", dest="src", required=True)',
      '    pay.add_argument("--to", dest="dst", required=True)',
      '    pay.add_argument("--cents", type=int, required=True)',
      '    pay.add_argument("--note", default="misc")',
    );
  }
  if (settle) lines.push('    sub.add_parser("settle")');
  lines.push(
    '    sub.add_parser("balances")',
    '    return parser',
    '',
    '',
    'def main(argv=None):',
    '    parser = build_parser()',
    '    args = parser.parse_args(argv)',
    '    if not args.cmd:',
    '        parser.print_help()',
    '        return 2',
    '    rows = load(args.data)',
    '    if args.cmd == "add":',
    '        names = [part for part in args.split.split(",") if part]',
    '        if args.payer not in names:',
    '            print("payer must be in the split", file=sys.stderr)',
    '            return 2',
  );
  if (guard) {
    lines.push(
      '        if args.cents < 0:',
      '            print("cents must be zero or more", file=sys.stderr)',
      '            return 2',
    );
  }
  lines.push(
    '        rows.append({',
    '            "kind": "expense", "date": args.date, "payer": args.payer,',
    '            "cents": args.cents, "note": args.note, "split": names,',
    '        })',
    '        save(args.data, rows)',
    '        return 0',
  );
  if (pay) {
    lines.push('    if args.cmd == "pay":');
    if (guard) {
      lines.push(
        '        if args.cents < 0:',
        '            print("cents must be zero or more", file=sys.stderr)',
        '            return 2',
      );
    }
    lines.push(
      '        rows.append({',
      '            "kind": "payment", "date": args.date,',
      '            "src": args.src, "dst": args.dst, "cents": args.cents, "note": args.note,',
      '        })',
      '        save(args.data, rows)',
      '        return 0',
    );
  }
  lines.push(
    '    balances = balances_for(rows)',
    '    if args.cmd == "balances":',
    '        for name in sorted(balances):',
    '            print("%s %s" % (name, show(balances[name])))',
    '        return 0',
  );
  if (settle) {
    lines.push(
      '    transfers = minimal_transfers(balances)',
      '    if not transfers:',
      '        print("everyone is settled")',
      '        return 0',
      '    for src, dst, cents in transfers:',
      '        print("%s pays %s %s" % (src, dst, show(cents)))',
      '    return 0',
    );
  } else {
    lines.push('    return 2');
  }
  lines.push('');
  return lines.join('\n');
}

const storeText = (payments) => `def load(path):
    try:
        text = open(path).read()
    except FileNotFoundError:
        return []
    rows = []
    for line in text.splitlines():
        if not line or line.startswith("#"):
            continue
        rows.append(_parse(line))
    return rows


def save(path, rows):
    with open(path, "w") as fh:
        for row in rows:
            fh.write(_format(row) + chr(10))


def _parse(line):
    kind, rest = line.split(" ", 1)
    parts = rest.split(" ")
    if kind == "expense":
        return {
            "kind": "expense",
            "date": parts[0],
            "payer": parts[1],
            "cents": int(parts[2]),
            "note": parts[3],
            "split": parts[4].split(","),
        }
${payments ? `    return {
        "kind": "payment",
        "date": parts[0],
        "src": parts[1],
        "dst": parts[2],
        "cents": int(parts[3]),
        "note": parts[4],
    }
` : `    raise ValueError("unknown line: %s" % line)
`}

def _format(row):
    if row["kind"] == "expense":
        return "expense %s %s %d %s %s" % (
            row["date"],
            row["payer"],
            row["cents"],
            row["note"],
            ",".join(row["split"]),
        )
${payments ? `    return "payment %s %s %s %d %s" % (
        row["date"], row["src"], row["dst"], row["cents"], row["note"],
    )
` : `    raise ValueError(row["kind"])
`}`;

const storeSqlite = `import sqlite3


def _connect(path):
    db = sqlite3.connect(path)
    db.execute(
        "create table if not exists entries ("
        "id integer primary key, kind text not null, date text not null, "
        "a text not null, b text not null, cents integer not null, "
        "note text not null, split text not null)"
    )
    return db


def load(path):
    db = _connect(path)
    rows = []
    query = "select kind, date, a, b, cents, note, split from entries order by id"
    for kind, date, a, b, cents, note, split in db.execute(query):
        if kind == "expense":
            rows.append({
                "kind": kind,
                "date": date,
                "payer": a,
                "cents": cents,
                "note": note,
                "split": split.split(",") if split else [],
            })
        else:
            rows.append({
                "kind": kind,
                "date": date,
                "src": a,
                "dst": b,
                "cents": cents,
                "note": note,
            })
    db.close()
    return rows


def save(path, rows):
    db = _connect(path)
    db.execute("delete from entries")
    for row in rows:
        if row["kind"] == "expense":
            a, b, split = row["payer"], "", ",".join(row["split"])
        else:
            a, b, split = row["src"], row["dst"], ""
        db.execute(
            "insert into entries (kind, date, a, b, cents, note, split) "
            "values (?, ?, ?, ?, ?, ?, ?)",
            (row["kind"], row["date"], a, b, row["cents"], row["note"], split),
        )
    db.commit()
    db.close()
`;

const storeJson = `import json


def load(path):
    try:
        with open(path) as fh:
            data = json.load(fh)
    except FileNotFoundError:
        return []
    return data["entries"]


def save(path, rows):
    with open(path, "w") as fh:
        json.dump({"entries": rows}, fh, indent=2)
        fh.write(chr(10))
`;

const settlePy = `def minimal_transfers(balances):
    """Return (from, to, cents) pairs that zero every balance."""
    debtors = sorted(
        ((name, -amt) for name, amt in balances.items() if amt < 0),
        key=lambda item: (-item[1], item[0]),
    )
    creditors = sorted(
        ((name, amt) for name, amt in balances.items() if amt > 0),
        key=lambda item: (-item[1], item[0]),
    )
    debtors = [list(item) for item in debtors]
    creditors = [list(item) for item in creditors]
    transfers = []
    i = 0
    j = 0
    while i < len(debtors) and j < len(creditors):
        pay = min(debtors[i][1], creditors[j][1])
        if pay:
            transfers.append((debtors[i][0], creditors[j][0], pay))
        debtors[i][1] -= pay
        creditors[j][1] -= pay
        if debtors[i][1] == 0:
            i += 1
        if creditors[j][1] == 0:
            j += 1
    return transfers
`;

const testPay = `import unittest

from tally.ledger import balances_for


class PayTest(unittest.TestCase):
    def test_payback_clears(self):
        rows = [
            {
                "kind": "expense",
                "payer": "lena",
                "cents": 900,
                "split": ["lena", "owen", "maya"],
            },
            {"kind": "payment", "src": "maya", "dst": "lena", "cents": 300},
        ]
        balances = balances_for(rows)
        self.assertEqual(balances["maya"], 0)
        self.assertEqual(balances["owen"], -300)
        self.assertEqual(balances["lena"], 300)


if __name__ == "__main__":
    unittest.main()
`;

const testSettle = (lenaOwes, owenCredit) => `import unittest

from tally.ledger import balances_for
from tally.settle import minimal_transfers


class SettleTest(unittest.TestCase):
    def test_ten_dollars_three_ways(self):
        rows = [{
            "kind": "expense",
            "payer": "owen",
            "cents": 1000,
            "split": ["lena", "owen", "maya"],
        }]
        balances = balances_for(rows)
        self.assertEqual(balances["lena"], ${lenaOwes})
        self.assertEqual(balances["owen"], ${owenCredit})
        self.assertEqual(balances["maya"], -333)

    def test_fewest_transfers(self):
        balances = {"lena": 500, "owen": -200, "maya": -300}
        self.assertEqual(
            minimal_transfers(balances),
            [("maya", "lena", 300), ("owen", "lena", 200)],
        )


if __name__ == "__main__":
    unittest.main()
`;

const testCli = `import unittest

from tally.cli import main


class CliTest(unittest.TestCase):
    def test_negative_cents_rejected(self):
        code = main([
            "add",
            "--date", "2023-11-12",
            "--payer", "lena",
            "--cents", "-5",
            "--split", "lena,owen",
        ])
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
`;

const workflow = (checkout, jobs) => {
  const setup = `      - uses: actions/checkout@v${checkout}
      - uses: actions/setup-python@v4
        with:
          python-version: "3.11"
`;
  const blocks = [];
  if (jobs.smoke) {
    blocks.push(`  smoke:
    runs-on: ubuntu-latest
    steps:
${setup}      - name: smoke
        run: ${jobs.smoke}
`);
  }
  if (jobs.test) {
    blocks.push(`  test:
    runs-on: ubuntu-latest
    steps:
${setup}      - name: unit tests
        run: python3 -m unittest discover -s tests -v
`);
  }
  return `name: test

on:
  push:
  pull_request:

jobs:
${blocks.join('\n')}`;
};

const dependabotCommit = `Bump actions/checkout from 3 to 4

Bumps [actions/checkout](https://github.com/actions/checkout) from 3 to 4.
- [Release notes](https://github.com/actions/checkout/releases)
- [Changelog](https://github.com/actions/checkout/blob/main/CHANGELOG.md)
- [Commits](https://github.com/actions/checkout/compare/v3...v4)

---
updated-dependencies:
- dependency-name: actions/checkout
  dependency-type: direct:production
  update-type: version-update:semver-major
...

Signed-off-by: dependabot[bot] <support@github.com>
`;

const dependabotBody = `Bumps [actions/checkout](https://github.com/actions/checkout) from 3 to 4.
<details>
<summary>Release notes</summary>

Sourced from [actions/checkout's releases](https://github.com/actions/checkout/releases).

## v4.0.0

Update default runtime to node20.

</details>
<details>
<summary>Commits</summary>

See the [compare view](https://github.com/actions/checkout/compare/v3...v4).

</details>

[![Dependabot compatibility score](https://dependabot-badges.githubapp.com/badges/compatibility_score?dependency-name=actions/checkout&package-manager=github_actions&previous-version=3&new-version=4)](https://docs.github.com/en/github/managing-security-vulnerabilities/about-dependabot-security-updates#about-compatibility-scores)

Dependabot will resolve any conflicts with this PR as long as you don't alter it yourself. You can also trigger a rebase manually by commenting @dependabot rebase.
`;

const webPy = `"""Local page. Not wired into the commands."""
from http.server import BaseHTTPRequestHandler, HTTPServer

from tally.ledger import balances_for
from tally.store import load


def handler(path):
    class Page(BaseHTTPRequestHandler):
        def do_GET(self):
            balances = balances_for(load(path))
            body = ["<ul>"]
            for name in sorted(balances):
                body.append("<li>%s %d</li>" % (name, balances[name]))
            body.append("</ul>")
            raw = "\\n".join(body).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(raw)

    return Page


def main():
    HTTPServer(("127.0.0.1", 8765), handler("ledger.db")).serve_forever()


if __name__ == "__main__":
    main()
`;

const codeowners = `# Settle-up math. Lena reviews changes here.
/tally/settle.py  @lenavoss
/tally/ledger.py  @lenavoss

/docs/  @owenbriggs
`;

const readme = {
  init: `# tally

Nothing here yet. We keep splitting groceries in a notes app and someone
is always short a few dollars.
`,
  v01: `# tally

tally splits one shared household bill between roommates.

    python tally.py owen 1000 lena,owen,maya

Prints who owes the payer, in cents. Names are comma-separated.
The payer has to be in the list.
`,
  package: `# tally

tally keeps a ledger of shared household expenses for the roomates
and prints who owes whom.

    python -m tally add --date 2023-03-04 --payer lena --cents 1860 --note groceries --split lena,owen,maya
    python -m tally balances

The ledger is a text file, ledger.txt. Notes are one word.
`,
  adr1: `# tally

tally keeps a ledger of shared household expenses for the roomates
and prints who owes whom.

    python -m tally add --date 2023-03-04 --payer lena --cents 1860 --note groceries --split lena,owen,maya
    python -m tally balances

The ledger is a text file, ledger.txt. Notes are one word.
See docs/adr/0001-record-architecture-decisions.md.
`,
  typo: `# tally

tally keeps a ledger of shared household expenses for the roommates
and prints who owes whom.

    python -m tally add --date 2023-03-04 --payer lena --cents 1860 --note groceries --split lena,owen,maya
    python -m tally balances

The ledger is a text file, ledger.txt. Notes are one word.
See docs/adr/0001-record-architecture-decisions.md.
`,
  pay: `# tally

tally keeps a ledger of shared household expenses for the roommates
and prints who owes whom.

    python -m tally add --date 2023-03-04 --payer lena --cents 1860 --note groceries --split lena,owen,maya
    python -m tally pay --date 2023-05-02 --from maya --to lena --cents 4000 --note venmo
    python -m tally balances

The ledger is a text file, ledger.txt. Notes are one word.
See docs/adr/0001-record-architecture-decisions.md.
`,
  sqlite: `# tally

tally keeps a ledger of shared household expenses for the roommates
and prints who owes whom.

    python -m tally add --date 2023-03-04 --payer lena --cents 1860 --note groceries --split lena,owen,maya
    python -m tally pay --date 2023-05-02 --from maya --to lena --cents 4000 --note venmo
    python -m tally balances

The ledger is a SQLite database file named ledger.db.
See docs/adr/0002-store-the-ledger-in-sqlite.md.
`,
  settle: `# tally

tally keeps a ledger of shared household expenses for the roommates
and prints who owes whom.

    python -m tally add --date 2023-03-04 --payer lena --cents 1860 --note groceries --split lena,owen,maya
    python -m tally pay --date 2023-05-02 --from maya --to lena --cents 4000 --note venmo
    python -m tally settle

The ledger is a SQLite database file named ledger.db.
See docs/adr/0002-store-the-ledger-in-sqlite.md.
`,
  final: `# tally

tally splits shared household expenses between roommates and prints the
smallest set of payments that settles everyone up.

Roommates: add an expense or a payback, then run settle. Start with
docs/how-it-works.md if you have not used it before.

    python -m tally add --date 2023-03-04 --payer lena --cents 1860 --note groceries --split lena,owen,maya
    python -m tally pay --date 2023-05-02 --from maya --to lena --cents 4000 --note venmo
    python -m tally settle

The ledger is a plain JSON file named ledger.json.
Everything else is in docs/index.md.
`,
};

const adr1 = `# ADR-0001: Record architecture decisions

Status: Accepted
Date: 2023-03-20

## Context

tally is a three-roommate project. Lena, Owen, and Kit will not all
remember why a choice was made six months later. Maya will ask.

## Decision

Hard-to-reverse choices go in docs/adr/, numbered, with a status line.
When a later record replaces one, edit the old status line. Do not
delete the old record.

## Consequences

- The reason has to be written down at the time, not reconstructed.
- A status line that still says Accepted is the current choice.
`;

const adr2 = (status) => `# ADR-0002: Store the ledger in a SQLite database

Status: ${status}
Date: 2023-06-11

## Context

ledger.txt is one space-separated line per entry. A note cannot contain
a space, so "ikea lamp" becomes two fields and the line will not parse.
Kit also wants to ask what the household spent on groceries without
writing a parser.

The file is small. Three people write to it, usually one at a time.

## Decision

tally/store.py keeps the ledger in a SQLite database file named
ledger.db, using the stdlib sqlite3 module. No extra package.

## Consequences

- Notes can contain spaces.
- ledger.db is not a file you edit by hand. tally is the editor.
- The text file is no longer read. Copy old lines in with tally add.
`;

const adr3 = `# ADR-0003: Amounts are integer cents

Status: Accepted
Date: 2023-06-25

## Context

The first script took a whole number of cents. Owen floated a --dollars
flag that would store a float. A float cannot represent 10 cents exactly,
and a grocery bill would drift.

## Decision

Every amount in the ledger is an integer number of cents. The commands
take --cents. Dollars are printed only when a person is reading the output.

Splitting a bill that does not divide evenly is a separate question.
This record does not answer it.

## Consequences

- No float rounding in the ledger.
- Callers pass cents, not dollars.
`;

const adr4 = `# ADR-0004: Store the ledger in a JSON file

Status: Accepted
Date: 2023-10-08
Supersedes: ADR-0002

## Context

ADR-0002 put the ledger in SQLite. Maya keeps the household folder in
Dropbox so the three laptops see the same file. In September the file
came back malformed. Owen traced it to Dropbox copying ledger.db while
tally had it open. See discussion #16.

A half-written text file is annoying. A malformed database file is a
dead ledger.

## Decision

tally/store.py writes ledger.json, a list of entries in the same shape
the commands already build. SQLite is gone. ADR-0002 is superseded.

## Consequences

- The folder can be copied by Dropbox or any other file sync.
- A truncated file can be retyped from the group chat. August was.
- Notes can still contain spaces.
`;

const howItWorks = `# How tally works

This page is for the roommates. No code.

## Add a bill

Someone pays, then types it in. Say who paid, the amount in cents, a
short note, and who shares it. Rent, groceries, the internet bill.
Type the amount in cents. 1860 is eighteen dollars and sixty cents.

## A payback

If you already paid someone back, record that too. Do not delete the
original bill. The payback just says money moved.

    python -m tally pay --date 2023-05-02 --from maya --to lena --cents 4000 --note venmo

## Who pays whom

tally settle matches the person who owes the most with the person who is owed the most,
and has the first pay the second as much as they can.
It repeats that until everyone is at zero. If two people owe the same
amount, the one whose name comes first in the alphabet pays first, so
the same bills always print the same payments.

A day when nobody owes anything prints "everyone is settled".

## The file

Bills and paybacks live in ledger.json, next to the app. It is a plain
text file. You can copy the folder between laptops.

## Who to ask

Ask Lena if a payment looks wrong. She wrote the part that turns
balances into payments. Owen keeps the file format. Maya uses it.
`;

const docsIndex = `# tally docs

tally is a small command-line app that splits shared household expenses
between roommates and says who should pay whom.

## For roommates

- [How it works](how-it-works.md): how a bill becomes a payment.
- [README](../README.md): the commands, and where the file lives.

## For the people who change the code

- [README](../README.md): how to run it.
- Written decision records, oldest first:
  - [ADR-0001](adr/0001-record-architecture-decisions.md) Record architecture decisions. Accepted.
  - [ADR-0002](adr/0002-store-the-ledger-in-sqlite.md) Store the ledger in a SQLite database. Superseded by ADR-0004.
  - [ADR-0003](adr/0003-amounts-are-integer-cents.md) Amounts are integer cents. Accepted.
  - [ADR-0004](adr/0004-store-the-ledger-in-a-json-file.md) Store the ledger in a JSON file. Accepted.
`;

/** @type {import('../schema.mjs').RepoSpec} */
const spec = {
  slug: 'tally',
  name: 'tally',
  owner: 'hearthware',
  description:
    'A small Python 3 command-line app that splits shared household expenses between roommates and prints who owes whom. Two developers, a part-time contributor, and one roommate who is not a developer, February 2023 to November 2023.',
  people: {
    lenavoss: {
      name: 'Lena Voss',
      email: '18440211+lenavoss@users.noreply.github.com',
      role: 'lead maintainer; owns the settle-up code',
      identities: {
        laptop: { name: 'Lena P', email: 'lena@laptop.local', linked: false },
      },
    },
    owenbriggs: {
      name: 'Owen Briggs',
      email: 'owen.briggs@fastmail.com',
      role: 'roommate and second developer',
    },
    kitalvarez: {
      name: 'Kit Alvarez',
      email: '77219004+kitalvarez@users.noreply.github.com',
      role: 'part-time contributor, weekends, Oakland (Pacific time)',
    },
    mayaruiz: {
      name: 'Maya Ruiz',
      email: '55021883+mayaruiz@users.noreply.github.com',
      role: 'roommate; uses tally, not a developer',
    },
    'dependabot[bot]': {
      name: 'dependabot[bot]',
      email: '49699333+dependabot[bot]@users.noreply.github.com',
      role: 'opens dependency bumps',
      kind: 'Bot',
    },
    'github-actions[bot]': {
      name: 'github-actions[bot]',
      email: 'github-actions[bot]@users.noreply.github.com',
      role: 'comments when the test workflow finishes',
      kind: 'Bot',
    },
  },
  steps: [
    {
      type: 'commit',
      key: 'c-init',
      at: '2023-02-11T16:40:00Z',
      author: 'lenavoss',
      message: 'Initial commit',
      files: {
        'README.md': readme.init,
        '.gitignore': gitignore,
      },
    },
    {
      type: 'pr',
      number: 1,
      title: 'Split one shared bill from the command line',
      author: 'lenavoss',
      body: `First useful bit of tally.

\`python tally.py owen 1000 lena,owen,maya\` prints who owes the payer, in cents. We have been doing this in a notes app and someone is always short.

No file yet. One bill, then it exits.`,
      labels: ['feature'],
      requestedReviewers: ['owenbriggs'],
      reactions: { heart: ['mayaruiz'] },
      branch: 'one-bill',
      openedAt: '2023-02-18T21:05:00Z',
      commits: [
        {
          key: 'c-script',
          at: '2023-02-18T21:12:00Z',
          author: 'lenavoss',
          message: 'Add tally.py',
          files: {
            'tally.py': tallyPy,
            '.github/workflows/test.yml': workflow(3, { smoke: 'python3 tally.py owen 1000 lena,owen,maya' }),
          },
        },
        {
          key: 'c-readme-v01',
          at: '2023-02-19T15:30:00Z',
          author: 'lenavoss',
          message: 'README: how to run the script',
          files: { 'README.md': readme.v01 },
        },
      ],
      reviews: [
        {
          id: 'pr1-rv-owen',
          author: 'owenbriggs',
          at: '2023-02-21T02:18:00Z',
          state: 'APPROVED',
          body: 'Ran the $10 detergent. 1000 cents, three names. Numbers match my notebook except Lena is a cent higher because she is typed first. Fine for a script. One nit inline.',
          threads: [
            {
              id: 'pr1-th-int',
              path: 'tally.py',
              line: 18,
              comments: [
                {
                  id: 'pr1-thread-owen',
                  author: 'owenbriggs',
                  at: '2023-02-21T02:18:00Z',
                  body: "int() on a decimal throws a traceback. Maya will type 10.50 one day. A sentence would be kinder.",
                },
                {
                  id: 'pr1-thread-lena',
                  author: 'lenavoss',
                  at: '2023-02-21T03:05:00Z',
                  body: 'yeah. I will do that after this lands, not in this one.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr1-maya',
          author: 'mayaruiz',
          at: '2023-02-22T18:40:00Z',
          body: 'Owen ran last week\'s groceries through it while I watched. It matched the notebook!! Thank you Lena.',
          reactions: { heart: ['lenavoss'] },
        },
        {
          id: 'pr1-lena',
          author: 'lenavoss',
          at: '2023-02-22T23:10:00Z',
          body: 'good. that is the whole job for now.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-script',
          at: '2023-02-18T21:40:00Z',
          conclusion: 'success',
          summary: '1000 cents, three names, exit 0',
        },
        {
          name: 'smoke',
          commit: 'c-readme-v01',
          at: '2023-02-19T16:00:00Z',
          conclusion: 'success',
          summary: 'readme matches the script',
        },
      ],
      outcome: { kind: 'merged', at: '2023-02-25T17:00:00Z', by: 'owenbriggs' },
    },
    {
      type: 'issue',
      number: 2,
      title: 'I typed 10.50 and got a wall of red text',
      author: 'mayaruiz',
      at: '2023-02-26T18:10:00Z',
      body: 'Owen showed me the script. I typed 10.50 because that is how money looks. It printed a long red error and stopped. Can it say what I did wrong?',
      labels: ['bug'],
      assignees: ['lenavoss'],
      comments: [
        {
          id: 'iss2-owen',
          author: 'owenbriggs',
          at: '2023-02-27T02:15:00Z',
          body: 'int() throws a traceback on a decimal. A sentence would be kinder. I said the same thing on the first change.',
        },
        {
          id: 'iss2-lena',
          author: 'lenavoss',
          at: '2023-02-27T16:40:00Z',
          body: 'I will push a fix from the laptop tonight.',
        },
      ],
    },
    {
      type: 'pr',
      number: 3,
      title: 'Print a sentence when cents is not a whole number',
      author: 'lenavoss',
      body: `Closes #2.

A decimal used to throw a traceback. It now prints that cents must be a whole number and exits.`,
      labels: ['bug'],
      assignees: ['lenavoss'],
      requestedReviewers: ['owenbriggs'],
      branch: 'usage-sentence',
      openedAt: '2023-02-28T01:05:00Z',
      commits: [
        {
          key: 'c-usage',
          at: '2023-02-28T01:20:00Z',
          author: 'lenavoss',
          identity: 'laptop',
          message: 'say so when cents is not a whole number',
          files: { 'tally.py': tallyPyKind },
        },
      ],
      reviews: [
        {
          id: 'pr3-rv-owen',
          author: 'owenbriggs',
          at: '2023-03-01T02:10:00Z',
          state: 'APPROVED',
          body: 'Sentence is what I asked for. Maya can type 10.50 and get words instead of a traceback.',
          threads: [],
        },
      ],
      comments: [
        {
          id: 'pr3-lena',
          author: 'lenavoss',
          at: '2023-03-01T18:40:00Z',
          body: 'Pushed from the laptop. git will say Lena P and lena@laptop.local. That is still me. The noreply address was not set on that machine.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-usage',
          at: '2023-02-28T01:45:00Z',
          conclusion: 'success',
          summary: 'decimal input prints a sentence, exit 2',
        },
      ],
      outcome: { kind: 'merged', at: '2023-03-03T16:00:00Z', by: 'owenbriggs', method: 'squash' },
    },
    {
      type: 'tag',
      name: 'v0.1.0',
      at: '2023-03-04T15:00:00Z',
      by: 'lenavoss',
      message: 'v0.1.0: one bill, one script\n\ntally.py splits a single shared bill and prints who owes the payer.\n',
    },
    {
      type: 'pr',
      number: 4,
      title: 'Turn the script into a package with a text ledger',
      author: 'owenbriggs',
      body: `The one-shot script is fine for a single detergent bottle. It is useless for a month of groceries.

This moves the split into a package and adds ledger.txt. \`python -m tally add\` appends one line. \`python -m tally balances\` prints the running totals.

Notes are one word. "groceries" fits. "ikea lamp" does not. We can live with that until the file format changes.`,
      labels: ['feature'],
      requestedReviewers: ['lenavoss'],
      branch: 'package-ledger',
      openedAt: '2023-03-18T19:20:00Z',
      commits: [
        {
          key: 'c-package',
          at: '2023-03-18T19:40:00Z',
          author: 'owenbriggs',
          message: 'Move the splitter into a package',
          files: {
            'tally.py': null,
            'tally/__init__.py': initPy('0.2.0'),
            'tally/__main__.py': mainPy,
            'tally/cli.py': cliOnce,
            'tally/ledger.py': ledgerNoPay,
            '.github/workflows/test.yml': workflow(3, { smoke: 'python3 -m tally owen 1000 lena,owen,maya' }),
          },
        },
        {
          key: 'c-store-txt',
          at: '2023-03-19T16:05:00Z',
          author: 'owenbriggs',
          message: 'Read and write ledger.txt',
          files: {
            'tally/store.py': storeText(false),
            'tally/cli.py': cliPy({ data: 'ledger.txt', pay: false, settle: false, dollars: false }),
            'README.md': readme.package,
            '.github/workflows/test.yml': workflow(3, { smoke: 'python3 -m tally balances' }),
          },
        },
        {
          key: 'c-adr1',
          at: '2023-03-20T01:22:00Z',
          author: 'lenavoss',
          message: 'ADR-0001: write decisions down',
          files: {
            'docs/adr/0001-record-architecture-decisions.md': adr1,
            'README.md': readme.adr1,
          },
        },
      ],
      reviews: [
        {
          id: 'pr2-rv-lena',
          author: 'lenavoss',
          at: '2023-03-22T03:10:00Z',
          state: 'APPROVED',
          body: 'Works. I added three grocery lines and the balances matched a hand calc. One limit inline, not blocking.',
          threads: [
            {
              id: 'pr2-th-note',
              path: 'tally/store.py',
              line: 24,
              comments: [
                {
                  id: 'pr2-thread-lena',
                  author: 'lenavoss',
                  at: '2023-03-22T03:10:00Z',
                  body: 'A space in the note splits the line into an extra field. "ikea lamp" will not parse.',
                },
                {
                  id: 'pr2-thread-owen',
                  author: 'owenbriggs',
                  at: '2023-03-22T12:40:00Z',
                  body: 'Yep. One word until we have a real file format. I said so in the README.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr2-kit',
          author: 'kitalvarez',
          at: '2023-03-23T07:00:00-07:00',
          body: 'ran it on my laptop, works. nice to see it as a package. sorry I am late, work ate the week.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-store-txt',
          at: '2023-03-19T16:40:00Z',
          conclusion: 'success',
          summary: 'balances match a hand calc',
        },
      ],
      outcome: { kind: 'merged', at: '2023-03-26T18:30:00Z', by: 'lenavoss' },
    },
    {
      type: 'commit',
      key: 'c-typo',
      at: '2023-04-02T15:14:00-07:00',
      author: 'kitalvarez',
      message: 'fix typo: roomates',
      files: { 'README.md': readme.typo },
    },
    {
      type: 'tag',
      name: 'v0.2.0',
      at: '2023-04-08T14:30:00Z',
      by: 'owenbriggs',
      message: 'v0.2.0: a package and a text ledger\n\nExpenses live in ledger.txt. python -m tally add and balances.\n',
    },
    {
      type: 'discussion',
      number: 5,
      title: 'I already paid Lena back and it still says I owe her',
      category: 'Ideas',
      author: 'mayaruiz',
      at: '2023-04-16T17:05:00Z',
      body: "ok dumb question. I venmo'd Lena 40 dollars for the ikea lamp last night. I had Owen run tally this morning and it still says I owe her. Can it remember that I paid?? I don't want to erase the lamp, then we forget who bought it.",
      comments: [
        {
          id: 'disc3-owen',
          author: 'owenbriggs',
          at: '2023-04-16T21:30:00Z',
          body: 'Not a dumb question. Right now the file only has expenses, so a Venmo never shows up. I can add a pay line: tally pay, from you, to Lena, 4000 cents. The lamp stays. The balance drops.',
          replies: [
            {
              id: 'disc3-maya',
              author: 'mayaruiz',
              at: '2023-04-17T00:12:00Z',
              body: 'yes!! 40 dollars is 4000, Owen already told me. Please do that. I will keep Venmo-ing and then tell you the number.',
            },
          ],
        },
        {
          id: 'disc3-lena',
          author: 'lenavoss',
          at: '2023-04-17T02:40:00Z',
          body: 'owen can you take it after the work trip? I do not want Maya deleting rows to make the number look right.',
          replies: [
            {
              id: 'disc3-owen-2',
              author: 'owenbriggs',
              at: '2023-04-18T01:05:00Z',
              body: 'Yes. First week of May.',
            },
            {
              id: 'disc3-kit',
              author: 'kitalvarez',
              at: '2023-04-18T08:20:00-07:00',
              body: 'I can look at the diff on a weekend if you want a second pair of eyes. I cannot start it. I did get the roommates typo in on Sunday at 3:14pm my time.',
            },
          ],
        },
      ],
    },
    {
      type: 'pr',
      number: 6,
      title: 'Record a payback so the balance can clear',
      author: 'owenbriggs',
      body: `Maya asked for this in discussion #5.

A Venmo should clear the balance without deleting the expense. \`tally pay --from maya --to lena --cents 4000\` appends a payment line. The lamp stays in the file.

add_payment credits the sender and debits the receiver.`,
      labels: ['feature'],
      requestedReviewers: ['lenavoss'],
      branch: 'pay-command',
      openedAt: '2023-05-06T20:11:00Z',
      commits: [
        {
          key: 'c-pay',
          at: '2023-05-06T20:20:00Z',
          author: 'owenbriggs',
          message: 'Add a pay command',
          files: {
            'tally/ledger.py': ledgerPy(false),
            'tally/store.py': storeText(true),
            'tally/cli.py': cliPy({ data: 'ledger.txt', pay: true, settle: false, dollars: false }),
          },
        },
        {
          key: 'c-pay-test',
          at: '2023-05-07T02:10:00Z',
          author: 'owenbriggs',
          message: 'test a payback that clears',
          files: {
            'tests/__init__.py': '\n',
            'tests/test_pay.py': testPay,
          },
        },
        {
          key: 'c-pay-readme',
          at: '2023-05-07T15:44:00Z',
          author: 'owenbriggs',
          message: 'README: mention pay',
          files: { 'README.md': readme.pay },
        },
        {
          key: 'c-ci',
          at: '2023-05-07T18:30:00Z',
          author: 'owenbriggs',
          message: 'run tests on GitHub',
          files: { '.github/workflows/test.yml': workflow(3, { smoke: 'python3 -m tally balances', test: true }) },
        },
      ],
      reviews: [
        {
          id: 'pr4-rv-lena',
          author: 'lenavoss',
          at: '2023-05-09T02:30:00Z',
          state: 'APPROVED',
          body: 'Matches the discussion. Test is the case Maya actually hit, 900 cents split three ways and a 300 cent payback. lgtm.',
          threads: [
            {
              id: 'pr4-th-sign',
              path: 'tally/ledger.py',
              line: 12,
              comments: [
                {
                  id: 'pr4-thread-lena',
                  author: 'lenavoss',
                  at: '2023-05-09T02:30:00Z',
                  body: 'Sender gets credited, receiver gets debited. If Maya pays me, her negative balance moves toward zero and mine does too. Right?',
                },
                {
                  id: 'pr4-thread-owen',
                  author: 'owenbriggs',
                  at: '2023-05-09T11:15:00Z',
                  body: 'Yes. Typing it twice would double-count, and then we edit the file by hand. Good enough for three people.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr4-maya',
          author: 'mayaruiz',
          at: '2023-05-11T19:15:00Z',
          body: 'Owen sat with me and typed the venmo. The lamp is still there and it no longer says I owe Lena. This is the one I wanted.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-pay-test',
          at: '2023-05-07T02:40:00Z',
          conclusion: 'success',
          summary: 'pay command runs',
        },
        {
          name: 'smoke',
          commit: 'c-ci',
          at: '2023-05-07T18:50:00Z',
          conclusion: 'success',
          summary: 'balances command exits 0',
        },
        {
          name: 'test',
          commit: 'c-ci',
          at: '2023-05-07T19:00:00Z',
          conclusion: 'success',
          summary: 'unit tests passed on the new workflow',
        },
      ],
      outcome: { kind: 'merged', at: '2023-05-13T16:00:00Z', by: 'lenavoss' },
    },
    {
      type: 'discussion',
      number: 7,
      title: 'Can tally do Canadian dollars from Montreal?',
      category: 'Q&A',
      author: 'mayaruiz',
      at: '2023-05-21T18:40:00Z',
      body: 'We did that weekend in Montreal in March. Owen paid for dinner in Canadian cash. Lena\'s card charged the airbnb in US dollars a few days later. My notes app has both and I cannot add them up. Can the app keep two kinds of money?',
      comments: [
        {
          id: 'disc5-owen',
          author: 'owenbriggs',
          at: '2023-05-21T22:05:00Z',
          body: 'A currency column is easy. The rate is the hard part. Which rate, and from which moment? The dinner and the airbnb posted days apart.',
          replies: [
            {
              id: 'disc5-maya',
              author: 'mayaruiz',
              at: '2023-05-22T01:18:00Z',
              body: 'Please do not pick one for us. we still don\'t agree on the kiosk rate. Owen wanted the number from his bank the next morning. Lena wanted the board at the airport. I wrote down what google said at the cafe. We argued for twenty minutes over four dollars. I would rather we agree on one number before anyone types it in.',
            },
            {
              id: 'disc5-lena',
              author: 'lenavoss',
              at: '2023-05-22T03:40:00Z',
              body: 'Not building a rate table. I am not refereeing that argument in code. Convert it yourself, then add one number.',
            },
          ],
        },
        {
          id: 'disc5-kit',
          author: 'kitalvarez',
          at: '2023-05-22T19:12:00-07:00',
          body: 'My old splitting app stored rates and nobody trusted them either. Leaving it.',
          replies: [
            {
              id: 'disc5-lena-2',
              author: 'lenavoss',
              at: '2023-05-23T14:00:00Z',
              body: 'Settled then. One currency. If someone asks again, point them at this thread.',
            },
          ],
        },
      ],
    },
    {
      type: 'issue',
      number: 8,
      title: 'ikea lamp breaks the list',
      author: 'mayaruiz',
      at: '2023-05-28T17:40:00Z',
      body: 'I tried to type ikea lamp as the note and tally would not take it. Owen says the note has to be one word. That is silly. The lamp is still a real purchase.',
      labels: ['bug'],
      assignees: ['kitalvarez'],
      reactions: { eyes: ['kitalvarez'] },
      comments: [
        {
          id: 'iss8-owen',
          author: 'owenbriggs',
          at: '2023-05-29T02:15:00Z',
          body: 'The text file splits on spaces. A note with a space becomes an extra field and the line will not parse.',
        },
        {
          id: 'iss8-kit',
          author: 'kitalvarez',
          at: '2023-05-29T11:00:00-07:00',
          body: 'I can put the list in a small database this weekend so the note can have spaces.',
        },
      ],
    },
    {
      type: 'pr',
      number: 9,
      title: 'Store the ledger in SQLite',
      author: 'kitalvarez',
      body: `ledger.txt cannot hold a note with a space. "ikea lamp" becomes two fields. I also want to ask what we spent on groceries without writing a parser.

This replaces tally/store.py with sqlite3 and ledger.db. Same row shape, so add and pay do not change. No extra package.

ADR-0002 has the why. Old lines are not imported. Re-add anything you still care about.

Fixes #8.`,
      labels: ['storage'],
      assignees: ['kitalvarez'],
      requestedReviewers: ['owenbriggs'],
      branch: 'sqlite-ledger',
      openedAt: '2023-06-10T14:00:00-07:00',
      commits: [
        {
          key: 'c-sqlite',
          at: '2023-06-10T14:18:00-07:00',
          author: 'kitalvarez',
          message: 'store: sqlite instead of ledger.txt',
          files: {
            'tally/store.py': storeSqlite,
            'tally/cli.py': cliPy({ data: 'ledger.db', pay: true, settle: false, dollars: false }),
          },
        },
        {
          key: 'c-adr2',
          at: '2023-06-11T10:05:00-07:00',
          author: 'kitalvarez',
          message: 'ADR-0002 sqlite ledger, update README',
          files: {
            'docs/adr/0002-store-the-ledger-in-sqlite.md': adr2('Accepted'),
            'README.md': readme.sqlite,
          },
        },
      ],
      reviews: [
        {
          id: 'pr6-rv-owen',
          author: 'owenbriggs',
          at: '2023-06-14T03:40:00Z',
          state: 'APPROVED',
          body: 'Tried it locally. Notes with spaces work, which is the point. One question inline, not blocking.',
          threads: [
            {
              id: 'pr6-th-lock',
              path: 'tally/store.py',
              line: 8,
              comments: [
                {
                  id: 'pr6-thread-owen',
                  author: 'owenbriggs',
                  at: '2023-06-14T03:40:00Z',
                  body: 'What happens if two of us run tally at the same moment?',
                },
                {
                  id: 'pr6-thread-kit',
                  author: 'kitalvarez',
                  at: '2023-06-14T09:22:00-07:00',
                  body: 'sqlite locks the file. We usually take turns. Good enough for three roommates.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr6-lena',
          author: 'lenavoss',
          at: '2023-06-16T12:20:00Z',
          body: 'merging. Maya can type "ikea lamp" now. do not hand-edit the db.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-adr2',
          at: '2023-06-11T17:40:00Z',
          conclusion: 'success',
          summary: 'balances command exits 0',
        },
        {
          name: 'test',
          commit: 'c-adr2',
          at: '2023-06-11T18:00:00Z',
          conclusion: 'success',
          summary: 'notes with spaces round-trip',
        },
      ],
      outcome: { kind: 'merged', at: '2023-06-18T15:30:00Z', by: 'lenavoss' },
    },
    {
      type: 'issue',
      number: 10,
      title: 'it prints three numbers and I still do not know who to pay',
      author: 'mayaruiz',
      at: '2023-06-19T16:20:00Z',
      body: 'Owen ran balances after groceries. It printed three numbers. I still do not know who pays who. Can it just say the sentence?',
      labels: ['enhancement'],
      assignees: ['lenavoss'],
      reactions: { '+1': ['owenbriggs'] },
      comments: [
        {
          id: 'iss10-owen',
          author: 'owenbriggs',
          at: '2023-06-19T22:05:00Z',
          body: 'That is the settle command I have been meaning to write. Lena can take it.',
        },
        {
          id: 'iss10-lena',
          author: 'lenavoss',
          at: '2023-06-20T02:40:00Z',
          body: 'I will do it this week. Fewest payments, same file always prints the same lines.',
        },
      ],
    },
    {
      type: 'issue',
      number: 11,
      title: 'balances still do not say who to pay',
      author: 'kitalvarez',
      at: '2023-06-20T08:10:00-07:00',
      body: 'Maya asked me again this morning. The balances command prints three numbers and she still does not know who to venmo. Can we print a sentence?',
      labels: ['enhancement'],
      comments: [
        {
          id: 'iss11-owen',
          author: 'owenbriggs',
          at: '2023-06-20T18:30:00Z',
          body: 'This is the same request as #10. Closing it as a duplicate.',
        },
      ],
      outcome: { kind: 'duplicate', at: '2023-06-20T18:45:00Z', by: 'owenbriggs', of: 10 },
    },
    {
      type: 'pr',
      number: 12,
      title: 'Settle up with the fewest payments',
      author: 'lenavoss',
      body: `balances prints three numbers and Maya still asks Owen who pays whom.

\`tally settle\` prints the fewest payments that clear the household. Largest debt against largest credit, ties broken by name, so the same file always prints the same lines.

The split itself is unchanged in this PR. Question on the test, which locks the current rule in.

Closes #10.`,
      labels: ['feature'],
      requestedReviewers: ['owenbriggs'],
      branch: 'settle-up',
      openedAt: '2023-06-24T19:50:00Z',
      commits: [
        {
          key: 'c-settle',
          at: '2023-06-24T20:05:00Z',
          author: 'lenavoss',
          message: 'settle: greedy fewest transfers',
          files: {
            'tally/settle.py': settlePy,
            'tally/cli.py': cliPy({
              data: 'ledger.db',
              pay: true,
              settle: true,
              dollars: false,
              importName: 'minimal_transfer',
            }),
          },
        },
        {
          key: 'c-settle-test',
          at: '2023-06-25T01:12:00Z',
          author: 'lenavoss',
          message: 'test settle on a ten dollar bill',
          files: { 'tests/test_settle.py': testSettle(-334, 667) },
        },
        {
          key: 'c-adr3',
          at: '2023-06-25T16:12:00Z',
          author: 'lenavoss',
          message: 'ADR-0003 amounts are integer cents',
          files: {
            'docs/adr/0003-amounts-are-integer-cents.md': adr3,
            'README.md': readme.settle,
          },
        },
        {
          key: 'c-settle-import',
          at: '2023-06-28T15:20:00Z',
          author: 'lenavoss',
          message: 'cli: import minimal_transfers',
          files: {
            'tally/cli.py': cliPy({ data: 'ledger.db', pay: true, settle: true, dollars: false }),
          },
        },
      ],
      reviews: [
        {
          id: 'pr7-rv-owen',
          author: 'owenbriggs',
          at: '2023-06-27T01:48:00Z',
          state: 'CHANGES_REQUESTED',
          body: 'The fewest-payments part looks right. I do not want to ship the split rule the test locks in. See inline. Smoke is also red on a bad import. Fix that here. The split rule can land after.',
          threads: [
            {
              id: 'pr7-th-cent',
              path: 'tests/test_settle.py',
              line: 14,
              comments: [
                {
                  id: 'pr7-thread-owen',
                  author: 'owenbriggs',
                  at: '2023-06-27T01:48:00Z',
                  body: 'balances["lena"], -334 means the extra cent goes to whoever is first in --split. On a $10 bill with three of us that is one cent, and if Lena is always typed first she pays the extra every time. Over a year of groceries that is a couple of dollars, always the same person. I do not love it.',
                },
                {
                  id: 'pr7-thread-lena',
                  author: 'lenavoss',
                  at: '2023-06-27T02:36:00Z',
                  body: 'Yeah, first-in-list is a bad default. I do not want tenths of a cent in the file, and rounding to the nearest cent still leaves a leftover when three people split an odd number. So the remainder rides with the payer. They already fronted the cash, and it stops depending on whose name got typed first.',
                },
                {
                  id: 'pr7-thread-kit',
                  author: 'kitalvarez',
                  at: '2023-06-27T07:10:00-07:00',
                  body: 'my old spreadsheet handed extra cents out by alphabetical order and people noticed by month two. quieter if the person who paid just eats it.',
                },
                {
                  id: 'pr7-thread-owen-2',
                  author: 'owenbriggs',
                  at: '2023-06-27T18:40:00Z',
                  body: 'Ok. Payer eats the leftover. Land that after this goes in so the fewest-payments work is not stuck on it.',
                },
              ],
            },
            {
              id: 'pr12-th-import',
              path: 'tally/cli.py',
              line: 6,
              resolved: true,
              comments: [
                {
                  id: 'pr12-thread-owen',
                  author: 'owenbriggs',
                  at: '2023-06-27T01:48:00Z',
                  body: 'Smoke failed on this import. minimal_transfer is not a name in settle.py. The function is minimal_transfers.',
                },
                {
                  id: 'pr12-thread-lena',
                  author: 'lenavoss',
                  at: '2023-06-28T15:30:00Z',
                  body: 'renamed it to minimal_transfers in the latest push. smoke should go green.',
                },
              ],
            },
          ],
        },
        {
          id: 'pr7-rv-owen-2',
          author: 'owenbriggs',
          at: '2023-06-29T02:15:00Z',
          state: 'APPROVED',
          body: 'Import is fixed. fewest-payments looks right. I will merge this and you can floor the split after.',
          threads: [],
        },
      ],
      comments: [
        {
          id: 'pr12-gha-fail',
          author: 'github-actions[bot]',
          at: '2023-06-24T20:42:00Z',
          body: 'Smoke failed: ImportError: cannot import name minimal_transfer.',
        },
        {
          id: 'pr12-gha-pass',
          author: 'github-actions[bot]',
          at: '2023-06-28T15:55:00Z',
          body: 'Smoke passed. minimal_transfers imports cleanly.',
        },
        {
          id: 'pr7-lena',
          author: 'lenavoss',
          at: '2023-07-01T16:05:00Z',
          body: 'merging so settle is there for the weekend groceries. split follow-up next.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-settle',
          at: '2023-06-24T20:40:00Z',
          conclusion: 'failure',
          summary: 'ImportError: cannot import name minimal_transfer',
        },
        {
          name: 'test',
          commit: 'c-settle',
          at: '2023-06-24T20:55:00Z',
          conclusion: 'success',
          summary: 'unit tests passed',
        },
        {
          name: 'smoke',
          commit: 'c-settle-test',
          at: '2023-06-25T01:25:00Z',
          conclusion: 'failure',
          summary: 'ImportError: cannot import name minimal_transfer',
        },
        {
          name: 'test',
          commit: 'c-settle-test',
          at: '2023-06-25T01:40:00Z',
          conclusion: 'success',
          summary: 'settle unit tests passed',
        },
        {
          name: 'smoke',
          commit: 'c-settle-import',
          at: '2023-06-28T15:50:00Z',
          conclusion: 'success',
          summary: 'minimal_transfers imports cleanly',
        },
        {
          name: 'test',
          commit: 'c-settle-import',
          at: '2023-06-28T16:05:00Z',
          conclusion: 'success',
          summary: 'unit tests passed',
        },
      ],
      outcome: { kind: 'merged', at: '2023-07-02T18:00:00Z', by: 'owenbriggs' },
    },
    {
      type: 'commit',
      key: 'c-remainder',
      at: '2023-07-08T21:33:00Z',
      author: 'lenavoss',
      message: 'ledger: floor the split',
      files: {
        'tally/ledger.py': ledgerPy(true),
        'tests/test_settle.py': testSettle(-333, 666),
      },
    },
    {
      type: 'commit',
      key: 'c-dollars',
      at: '2023-07-12T02:08:00Z',
      author: 'lenavoss',
      identity: 'laptop',
      message: 'print dollars, not raw cents',
      files: {
        'tally/cli.py': cliPy({ data: 'ledger.db', pay: true, settle: true, dollars: true }),
        'tally/__init__.py': initPy('0.3.0'),
      },
    },
    {
      type: 'tag',
      name: 'v0.3.0',
      at: '2023-07-15T15:20:00Z',
      by: 'lenavoss',
      message: 'v0.3.0: a database ledger and settle-up\n\nThe ledger is a SQLite file (ADR-0002). tally settle prints the fewest\npayments that clear the household.\n',
    },
    {
      type: 'issue',
      number: 13,
      title: 'can it text me when I owe someone',
      author: 'mayaruiz',
      at: '2023-07-22T17:30:00Z',
      body: 'Can tally text me when I owe someone? I forget to ask Owen until rent day and then it is awkward.',
      labels: ['enhancement'],
      assignees: ['lenavoss'],
      comments: [
        {
          id: 'iss13-lena',
          author: 'lenavoss',
          at: '2023-07-23T02:15:00Z',
          body: 'Yes, I can add a text next weekend. Same number as the group chat.',
          edits: [
            {
              at: '2023-07-23T04:05:00Z',
              body: 'We are not adding texts. The living room laptop is not a pager, and I will not babysit a notification setup.',
            },
          ],
        },
        {
          id: 'iss13-owen',
          author: 'owenbriggs',
          at: '2023-07-24T16:20:00Z',
          body: 'Agreed. Closing this as not planned. If we need a reminder, Maya can ask one of us.',
        },
      ],
      outcome: { kind: 'closed', at: '2023-07-25T18:00:00Z', by: 'owenbriggs', reason: 'not_planned' },
    },
    {
      type: 'pr',
      number: 14,
      title: 'Local web page for balances (WIP)',
      author: 'kitalvarez',
      body: `Maya keeps asking Owen to type things in. This is a page on localhost:8765 that lists balances from ledger.db.

Still TODO: a form to add a bill. Opening early because I do not want to build the form if nobody wants the page.

Sorry this sat on my laptop for a week.`,
      labels: ['wip'],
      requestedReviewers: ['lenavoss'],
      branch: 'local-page',
      openedAt: '2023-08-12T09:40:00-07:00',
      commits: [
        {
          key: 'c-web',
          at: '2023-08-12T09:55:00-07:00',
          author: 'kitalvarez',
          message: 'wip: local page for balances',
          files: { 'tally/web.py': webPy },
        },
      ],
      reviews: [
        {
          id: 'pr8-rv-lena',
          author: 'lenavoss',
          at: '2023-08-14T02:10:00Z',
          state: 'CHANGES_REQUESTED',
          body: 'I do not want this running in the apartment. See inline, and I want Maya to say if she even wants it.',
          threads: [
            {
              id: 'pr8-th-host',
              path: 'tally/web.py',
              line: 28,
              comments: [
                {
                  id: 'pr8-thread-lena',
                  author: 'lenavoss',
                  at: '2023-08-14T02:10:00Z',
                  body: "I don't want a server on the living room laptop. The power strip gets switched off and then the page is just another thing that is down. Debugging a server is worse than splitting groceries.",
                },
                {
                  id: 'pr8-thread-kit',
                  author: 'kitalvarez',
                  at: '2023-08-14T08:30:00-07:00',
                  body: 'It only listens on localhost. Still a process, I know. If Maya does not want it I will drop it.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr8-owen',
          author: 'owenbriggs',
          at: '2023-08-15T03:20:00Z',
          body: 'If Maya is happy with the sentence from settle, I would not add a second way to enter bills. Two ways means two bugs.',
        },
        {
          id: 'pr14-kit-claim',
          author: 'kitalvarez',
          at: '2023-08-15T11:00:00-07:00',
          body: 'Maya asked me for this page in the group chat last week. She is tired of the terminal.',
        },
        {
          id: 'pr8-maya',
          author: 'mayaruiz',
          at: '2023-08-16T18:45:00Z',
          body: "I don't need a website. I never asked for one. I asked Owen to type the groceries. I just want the who-pays-who sentence, which I have now.",
        },
        {
          id: 'pr8-kit',
          author: 'kitalvarez',
          at: '2023-08-19T12:50:00-07:00',
          body: 'Closing this. Maya does not want a page, and I am not going to win Lena over on a server in the apartment. The branch can sit.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-web',
          at: '2023-08-12T17:15:00Z',
          conclusion: 'success',
          summary: 'balances command exits 0',
        },
        {
          name: 'test',
          commit: 'c-web',
          at: '2023-08-12T17:30:00Z',
          conclusion: 'success',
          summary: 'unit tests passed',
        },
      ],
      outcome: { kind: 'closed', at: '2023-08-19T13:05:00-07:00', by: 'kitalvarez' },
    },
    {
      type: 'discussion',
      number: 15,
      title: 'Whose turn is the Costco run',
      category: 'General',
      author: 'mayaruiz',
      at: '2023-08-26T18:05:00Z',
      body: 'Not really a tally question. Whose turn is Costco? I am not buying the olive oil again. Last time I paid and then forgot to tell Owen the number.',
      comments: [
        {
          id: 'disc15-owen',
          author: 'owenbriggs',
          at: '2023-08-26T21:40:00Z',
          body: 'Mine, I think. I also killed the sourdough starter. It was on the fridge and I left town. Do not open the jar.',
          replies: [
            {
              id: 'disc15-maya',
              author: 'mayaruiz',
              at: '2023-08-27T00:20:00Z',
              body: 'The starter is not the question. Also the router has been blinking since Thursday and the hallway bulb keeps buzzing.',
            },
            {
              id: 'disc15-kit',
              author: 'kitalvarez',
              at: '2023-08-27T11:05:00-07:00',
              body: 'Router is the white one behind the tv, not the black one. I reset it last month. The starter is Owen\'s problem.',
            },
          ],
        },
        {
          id: 'disc15-lena',
          author: 'lenavoss',
          at: '2023-08-28T01:15:00Z',
          body: 'Costco is Owen this week. Write the olive oil in tally when you get back. The router and the jar are not this thread.',
          replies: [],
        },
      ],
    },
    {
      type: 'discussion',
      number: 16,
      title: 'tally says the file is malformed',
      category: 'General',
      author: 'mayaruiz',
      at: '2023-09-09T15:30:00Z',
      body: "tally says the file is malformed. I didn't do anything except open the shared folder on my laptop like usual. Owen has the same folder in Dropbox. Can someone fix it? I have groceries to add.",
      comments: [
        {
          id: 'disc9-owen',
          author: 'owenbriggs',
          at: '2023-09-09T19:12:00Z',
          body: 'I can reproduce it. Dropbox synced ledger.db while tally had it open. I got database disk image is malformed on Thursday and again this morning. SQLite does not survive a mid-write copy. A plain text file would have been annoying if it got cut off. This one is just dead.',
          replies: [
            {
              id: 'disc9-maya',
              author: 'mayaruiz',
              at: '2023-09-09T21:05:00Z',
              body: "I am not going to remember to pause Dropbox every time someone adds a bill. That is how the folder works. If the app cannot live in that folder, the app is wrong, not me.",
            },
            {
              id: 'disc9-lena',
              author: 'lenavoss',
              at: '2023-09-10T02:40:00Z',
              body: 'Agreed. We picked the database so notes could have spaces. That was the wrong trade if the file has to survive Dropbox. Put it back in a plain file Owen can sync. I will not ask Maya to change how she shares the folder.',
            },
          ],
        },
        {
          id: 'disc9-kit',
          author: 'kitalvarez',
          at: '2023-09-10T20:15:00-07:00',
          body: 'This one is on me. I pushed the database. I can dump the rows this weekend if Owen writes the file code.',
          replies: [
            {
              id: 'disc9-owen-2',
              author: 'owenbriggs',
              at: '2023-09-12T01:28:00Z',
              body: 'I will do the file code. Kit, save the rows before we throw the broken file away. Maya should not have to retype August.',
            },
          ],
        },
      ],
    },
    {
      type: 'pr',
      number: 17,
      title: 'Bump actions/checkout from 3 to 4',
      author: 'dependabot[bot]',
      body: dependabotBody,
      labels: ['dependencies'],
      requestedReviewers: ['lenavoss'],
      branch: 'dependabot/github_actions/actions/checkout-4',
      openedAt: '2023-09-22T15:05:00Z',
      commits: [
        {
          key: 'c-bump',
          at: '2023-09-22T15:12:00Z',
          author: 'dependabot[bot]',
          via: 'web',
          message: dependabotCommit,
          files: { '.github/workflows/test.yml': workflow(4, { smoke: 'python3 -m tally balances', test: true }) },
        },
      ],
      reviews: [
        {
          id: 'pr17-rv-lena',
          author: 'lenavoss',
          at: '2023-09-23T02:10:00Z',
          state: 'APPROVED',
          body: 'Approved. Tests still run on 3.11.',
          threads: [],
        },
      ],
      comments: [
        {
          id: 'pr17-gha',
          author: 'github-actions[bot]',
          at: '2023-09-22T15:45:00Z',
          body: 'smoke: success. test: success. unit tests passed.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-bump',
          at: '2023-09-22T15:25:00Z',
          conclusion: 'success',
          summary: 'balances command exits 0',
        },
        {
          name: 'test',
          commit: 'c-bump',
          at: '2023-09-22T15:40:00Z',
          conclusion: 'success',
          summary: 'unit tests passed',
        },
      ],
      outcome: { kind: 'merged', at: '2023-09-25T16:00:00Z', by: 'lenavoss', method: 'squash' },
    },
    {
      type: 'pr',
      number: 18,
      title: 'Put the ledger back in a plain JSON file',
      author: 'owenbriggs',
      body: `Does what we agreed in discussion #16.

Dropbox copied ledger.db while tally had it open and the file came back malformed. Twice. A plain file survives that. A database file does not.

tally/store.py now writes ledger.json. The commands already build the same entries, so add and pay do not change. ADR-0004 records it. ADR-0002 is marked superseded.

README still describes the database. Leaving that for the docs pass so this stays a storage change.`,
      labels: ['storage'],
      requestedReviewers: ['lenavoss'],
      branch: 'json-ledger',
      openedAt: '2023-10-07T18:22:00Z',
      commits: [
        {
          key: 'c-json',
          at: '2023-10-07T18:40:00Z',
          author: 'owenbriggs',
          message: 'store: json file, drop sqlite',
          files: {
            'tally/store.py': storeJson,
            'tally/cli.py': cliPy({ data: 'ledger.json', pay: true, settle: true, dollars: true }),
          },
        },
        {
          key: 'c-adr4',
          at: '2023-10-08T16:15:00Z',
          author: 'owenbriggs',
          message: 'ADR-0004 json ledger, supersede ADR-0002',
          files: {
            'docs/adr/0004-store-the-ledger-in-a-json-file.md': adr4,
            'docs/adr/0002-store-the-ledger-in-sqlite.md': adr2('Superseded by ADR-0004'),
          },
        },
      ],
      reviews: [
        {
          id: 'pr10-rv-lena',
          author: 'lenavoss',
          at: '2023-10-11T03:05:00Z',
          state: 'APPROVED',
          body: 'Store looks right. ADR matches discussion #16. One docs miss inline, not blocking.',
          threads: [
            {
              id: 'pr10-th-readme',
              path: 'README.md',
              line: 10,
              comments: [
                {
                  id: 'pr10-thread-lena',
                  author: 'lenavoss',
                  at: '2023-10-11T03:05:00Z',
                  body: 'README still says sqlite. not blocking, fix it in the docs pass.',
                },
                {
                  id: 'pr10-thread-owen',
                  author: 'owenbriggs',
                  at: '2023-10-11T12:20:00Z',
                  body: 'Left it on purpose. Kit said he would do the docs page after this.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr10-kit',
          author: 'kitalvarez',
          at: '2023-10-12T06:40:00-07:00',
          body: 'Dumped the 40 rows into the group chat so Maya is not retyping August. I will fix the README and write a how-it-works page next month, after the work trip.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-json',
          at: '2023-10-07T18:55:00Z',
          conclusion: 'success',
          summary: 'balances command exits 0',
        },
        {
          name: 'test',
          commit: 'c-json',
          at: '2023-10-07T19:10:00Z',
          conclusion: 'success',
          summary: 'json store round-trips an expense',
        },
      ],
      outcome: { kind: 'merged', at: '2023-10-14T17:45:00Z', by: 'lenavoss' },
    },
    {
      type: 'commit',
      key: 'c-codeowners',
      at: '2023-10-21T18:12:00Z',
      author: 'lenavoss',
      message: 'add CODEOWNERS',
      files: { '.github/CODEOWNERS': codeowners },
    },
    {
      type: 'pr',
      number: 20,
      title: 'Docs for 1.0, and fix the README',
      author: 'kitalvarez',
      body: `README still told people to open ledger.db. The code has been writing ledger.json since #18. Fixed.

Also:
- docs/index.md, roommates vs people who change the code, including which decision records are still current
- docs/how-it-works.md, written so Maya can read it
- version 1.0.0`,
      labels: ['docs'],
      requestedReviewers: ['owenbriggs'],
      branch: 'docs-1.0',
      openedAt: '2023-11-04T12:10:00-07:00',
      commits: [
        {
          key: 'c-docs',
          at: '2023-11-04T12:25:00-07:00',
          author: 'kitalvarez',
          message: 'docs: index and how it works',
          files: {
            'docs/index.md': docsIndex,
            'docs/how-it-works.md': howItWorks,
          },
        },
        {
          key: 'c-readme-fix',
          at: '2023-11-04T14:02:00-07:00',
          author: 'kitalvarez',
          message: 'README: ledger is a json file, not sqlite',
          files: {
            'README.md': readme.final,
            'tally/__init__.py': initPy('1.0.0'),
          },
        },
      ],
      reviews: [
        {
          id: 'pr11-rv-owen',
          author: 'owenbriggs',
          at: '2023-11-06T02:30:00Z',
          state: 'APPROVED',
          body: 'Read how-it-works against settle.py. The matching rule is right. README no longer sends people at ledger.db. Thanks for catching that, I left it.',
          threads: [
            {
              id: 'pr11-th-ties',
              path: 'docs/how-it-works.md',
              line: 22,
              comments: [
                {
                  id: 'pr11-thread-owen',
                  author: 'owenbriggs',
                  at: '2023-11-06T02:30:00Z',
                  body: 'Ties really do go by name. Same file, same payments. Good that you wrote that down.',
                },
                {
                  id: 'pr11-thread-kit',
                  author: 'kitalvarez',
                  at: '2023-11-05T20:15:00-08:00',
                  body: 'Copied it from the sort in settle.py. Did not want to invent a rule.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'pr11-maya',
          author: 'mayaruiz',
          at: '2023-11-06T18:00:00Z',
          body: 'I read the how-it-works page. I understood it. That has not happened with the other pages. The payback part is what I asked for in the spring, written so I can find it again.',
          reactions: { heart: ['lenavoss'] },
        },
        {
          id: 'pr20-kit',
          author: 'kitalvarez',
          at: '2023-11-07T09:15:00-08:00',
          body: 'git log shows Lena P on the dollars print change. That is her laptop. lena@laptop.local is not linked to the account.',
        },
      ],
      checks: [
        {
          name: 'smoke',
          commit: 'c-readme-fix',
          at: '2023-11-04T21:15:00Z',
          conclusion: 'success',
          summary: 'balances command exits 0',
        },
        {
          name: 'test',
          commit: 'c-readme-fix',
          at: '2023-11-04T21:30:00Z',
          conclusion: 'success',
          summary: 'unit tests passed',
        },
      ],
      outcome: { kind: 'merged', at: '2023-11-08T15:30:00Z', by: 'owenbriggs' },
    },
    {
      type: 'commit',
      key: 'c-fix-tests',
      at: '2023-11-12T18:40:00Z',
      author: 'owenbriggs',
      message: 'fix tests',
      files: {
        'tally/cli.py': cliPy({ data: 'ledger.json', pay: true, settle: true, dollars: true, guard: true }),
        'tests/test_cli.py': testCli,
      },
    },
    {
      type: 'tag',
      name: 'v1.0.0',
      at: '2023-11-18T16:00:00Z',
      by: 'lenavoss',
      message: 'v1.0.0: a file you can copy, and docs\n\nThe ledger is a JSON file again (ADR-0004). docs/ explains the app for\nroommates and lists which decision records still apply.\n',
      release: {
        title: 'tally 1.0.0',
        body: `A file you can copy between laptops, and a guide for the roommates.

The list of bills is a plain file named ledger.json. tally settle prints the fewest payments that clear the household. Start with docs/how-it-works.md.
`,
      },
    },
    {
      type: 'issue',
      number: 21,
      title: 'can rent just repeat every month',
      author: 'mayaruiz',
      at: '2023-11-20T18:00:00Z',
      body: 'Rent is the same every month. I do not want to ask Owen to type it twelve times. Owen said he wrote this up as #19. He opened that and then deleted it. I cannot find #19. Can tally remember a bill and copy it forward?',
      labels: ['enhancement'],
      assignees: ['owenbriggs'],
      comments: [
        {
          id: 'iss21-owen',
          author: 'owenbriggs',
          at: '2023-11-21T02:30:00Z',
          body: 'The copy-forward idea is real. I am not building it this month. Leaving this open.',
        },
        {
          id: 'iss21-maya',
          author: 'mayaruiz',
          at: '2023-11-21T17:10:00Z',
          body: 'ok I will keep asking Owen to type rent then. Just wanted it written down.',
        },
      ],
    },
  ],
  answerKey: [
    {
      id: 'what-is-tally',
      view: 'docs',
      facet: 'overview',
      question: 'What is tally and who is it for?',
      answers: {
        technical:
          'A Python 3 app (package tally, run as python -m tally) for roommates Lena, Owen, and Maya. As of v1.0.0 the README says it splits shared household expenses and prints the smallest set of payments that settles everyone up. Roommates read docs/how-it-works.md. People changing the code read README.md and docs/adr/.',
        nonTechnical:
          'Tally is a small app three roommates use to split shared bills and see who should pay whom. You add a grocery run or a payback, then ask it who owes what.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-readme-fix', quote: 'smallest set of payments that settles everyone up.' },
        { kind: 'file', path: 'docs/index.md', at: 'c-docs', quote: 'splits shared household expenses' },
        { kind: 'file', path: 'docs/how-it-works.md', at: 'c-docs', quote: 'This page is for the roommates.' },
        { kind: 'file', path: 'tally/__init__.py', at: 'c-readme-fix', quote: '__version__ = "1.0.0"' },
      ],
    },
    {
      id: 'docs-map',
      view: 'docs',
      facet: 'overview',
      question: 'Where should a roommate start reading, and where should a developer start?',
      answers: {
        technical:
          'docs/index.md (c-docs, PR #20, 2023-11-04) splits the docs. "For roommates" links how-it-works.md and the README. "For the people who change the code" links the README and the four decision records with their current status. The README at c-readme-fix points roommates at docs/how-it-works.md.',
        nonTechnical:
          'Roommates should start with the page that explains how a bill becomes a payment. The people who change the app start with the front page and the written decision records. A contents page links all of them.',
      },
      evidence: [
        { kind: 'file', path: 'docs/index.md', at: 'c-docs', quote: '## For roommates' },
        { kind: 'file', path: 'docs/index.md', at: 'c-docs', quote: '## For the people who change the code' },
        { kind: 'file', path: 'README.md', at: 'c-readme-fix', quote: 'Start with' },
        { kind: 'pr', number: 20, quote: 'roommates vs people who change the code' },
      ],
    },
    {
      id: 'growth-arc',
      view: 'timeline',
      facet: 'growth',
      question: 'How did tally grow from the first commit to the 1.0 release?',
      answers: {
        technical:
          'README at c-init (2023-02-11) says they were splitting groceries in a notes app. Four annotated tags mark the phases. v0.1.0 (2023-03-04) is one script that splits a single bill. v0.2.0 (2023-04-08) is a package with a text ledger. v0.3.0 (2023-07-15) stores the ledger in SQLite (ADR-0002) and adds tally settle. v1.0.0 (2023-11-18) puts the ledger back in a JSON file (ADR-0004) and adds docs/.',
        nonTechnical:
          'It started in February 2023 as a one-off helper for a single grocery bill. By April it kept a running list of bills. By July it could tell the roommates the fewest payments that clear the slate, and the list lived in a small database file. In November the finished version kept that list in a plain text file and added a guide for the roommates.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-init', quote: 'We keep splitting groceries in a notes app' },
        { kind: 'tag', name: 'v0.1.0', quote: 'v0.1.0: one bill, one script' },
        { kind: 'tag', name: 'v0.2.0', quote: 'v0.2.0: a package and a text ledger' },
        { kind: 'tag', name: 'v0.3.0', quote: 'v0.3.0: a database ledger and settle-up' },
        { kind: 'tag', name: 'v1.0.0', quote: 'v1.0.0: a file you can copy, and docs' },
      ],
    },
    {
      id: 'sqlite-adopted',
      view: 'timeline',
      facet: 'adr',
      question: 'Why did the bill list move into a small database file?',
      answers: {
        technical:
          'PR #9 (Kit Alvarez, merged 2023-06-18) replaced tally/store.py\'s text file with sqlite3 and ledger.db. ADR-0002 (c-adr2, dated 2023-06-11) records why: ledger.txt cannot hold a note with a space, and Kit wanted to ask what the household spent on groceries without writing a parser. The README sentence "The ledger is a SQLite database file named ledger.db." lands in that same commit.',
        nonTechnical:
          'In June 2023 the part-time helper replaced the plain list with a small database file. The old list could not hold a note with a space in it, and they wanted to look up what the household had spent on groceries.',
      },
      evidence: [
        { kind: 'file', path: 'docs/adr/0002-store-the-ledger-in-sqlite.md', at: 'c-adr2', quote: 'A note cannot contain' },
        { kind: 'file', path: 'docs/adr/0002-store-the-ledger-in-sqlite.md', at: 'c-adr2', quote: 'what the household spent on groceries' },
        { kind: 'pr', number: 9, quote: 'ledger.txt cannot hold a note with a space' },
        { kind: 'file', path: 'tally/store.py', at: 'c-sqlite', quote: 'sqlite3.connect' },
        { kind: 'file', path: 'README.md', at: 'c-adr2', quote: 'The ledger is a SQLite database file named ledger.db.' },
      ],
    },
    {
      id: 'storage-twice',
      view: 'timeline',
      facet: 'reversal',
      question: 'Why was storage switched twice?',
      answers: {
        technical:
          'Two switches. First, PR #9 and ADR-0002 (c-adr2, 2023-06-11, merged 2023-06-18) moved ledger.txt to a SQLite file so notes could contain spaces. Second, discussion #16 (2023-09-09) is the first place the reversal reason appears: Owen says Dropbox synced ledger.db while tally had it open and SQLite came back malformed. PR #18 (merged 2023-10-14) adds ADR-0004 and edits ADR-0002\'s status line to "Superseded by ADR-0004". tally/store.py at c-json writes ledger.json.',
        nonTechnical:
          'The list of bills moved twice. In June it moved into a small database file so notes could include spaces. In September that file broke because the roommates kept it in a shared folder that copies files between laptops, and a copy landed while the app still had the file open. In October the team put the list back in a plain text file.',
      },
      evidence: [
        { kind: 'file', path: 'docs/adr/0002-store-the-ledger-in-sqlite.md', at: 'c-adr2', quote: 'Status: Accepted' },
        { kind: 'comment', id: 'disc9-owen', quote: 'Dropbox synced ledger.db while tally had it open' },
        { kind: 'file', path: 'docs/adr/0004-store-the-ledger-in-a-json-file.md', at: 'c-adr4', quote: 'See discussion #16.' },
        { kind: 'file', path: 'docs/adr/0002-store-the-ledger-in-sqlite.md', at: 'c-adr4', quote: 'Status: Superseded by ADR-0004' },
        { kind: 'file', path: 'tally/store.py', at: 'c-json', quote: 'json.dump' },
      ],
    },
    {
      id: 'readme-caught-up',
      view: 'timeline',
      facet: 'reversal',
      question: 'After the switch back to a plain text file, when did the README catch up?',
      answers: {
        technical:
          'PR #18 merged on 2023-10-14 without editing README.md. At c-adr4 the README still says "The ledger is a SQLite database file named ledger.db." Lena flagged it in the PR #18 review thread on 2023-10-11 and called it not blocking. Kit fixes it in PR #20, commit c-readme-fix (2023-11-04), merged 2023-11-08. The new sentence is "The ledger is a plain JSON file named ledger.json." That is 21 days after the reversal merged.',
        nonTechnical:
          'For about three weeks after the switch back to a plain text file, the front page still told people to open the small database file. Someone noticed while looking at that change, and the front page was corrected in early November 2023.',
      },
      evidence: [
        { kind: 'file', path: 'README.md', at: 'c-adr4', quote: 'The ledger is a SQLite database file named ledger.db.' },
        { kind: 'comment', id: 'pr10-thread-lena', quote: 'README still says sqlite. not blocking, fix it in the docs pass.' },
        { kind: 'pr', number: 20, quote: 'README still told people to open ledger.db.' },
        { kind: 'file', path: 'README.md', at: 'c-readme-fix', quote: 'The ledger is a plain JSON file named ledger.json.' },
        { kind: 'commit', key: 'c-readme-fix', quote: 'README: ledger is a json file, not sqlite' },
      ],
    },
    {
      id: 'leftover-cent',
      view: 'timeline',
      facet: 'decision',
      question: 'How is a leftover cent handled when a bill does not split evenly, and why?',
      answers: {
        technical:
          'Decided only in Owen\'s review thread on PR #12 (tests/test_settle.py, 2023-06-27). The code in that PR still gives the extra cent to the first name in --split: tally/ledger.py at c-settle uses divmod, and the test expects balances["lena"] == -334. Lena rejects first-in-list, nearest-cent rounding, and tenths of a cent, and says the remainder rides with the payer. The commit between Owen\'s reviews, c-settle-import, only renames a bad import. It does not change the split. c-remainder (2023-07-08, pushed straight to main) changes add_expense to floor division and updates the test to -333. No comment, and the commit message does not say why.',
        nonTechnical:
          'If a bill does not split into even cents, the person who paid keeps the leftover cents. The team agreed to that in June 2023 while looking at the change, because giving the extra cent to whoever was typed first felt unfair. The reason was only written in that conversation, not in the app or the guide.',
      },
      evidence: [
        { kind: 'comment', id: 'pr7-thread-lena', quote: 'the remainder rides with the payer' },
        { kind: 'comment', id: 'pr7-thread-owen', quote: 'the extra cent goes to whoever is first in --split' },
        { kind: 'file', path: 'tally/ledger.py', at: 'c-settle', quote: 'base, extra = divmod(cents, len(names))' },
        { kind: 'file', path: 'tally/ledger.py', at: 'c-remainder', quote: 'each = cents // len(names)' },
        { kind: 'commit', key: 'c-remainder', quote: 'ledger: floor the split' },
      ],
      onlyOutsideGit: ['remainder rides with the payer'],
    },
    {
      id: 'no-multicurrency',
      view: 'timeline',
      facet: 'unwritten-why',
      question: 'Why does tally not support more than one currency?',
      answers: {
        technical:
          'No currency field exists in the ledger row shape (tally/store.py at c-json, tally/ledger.py). docs/how-it-works.md says to type the amount in cents and does not explain the limit. The reason is only in discussion #7 (2023-05-21): after a Montreal weekend, Maya, Owen, and Lena disagreed about the exchange rate, and Maya writes that they still do not agree on the kiosk rate. Lena says she will not build a rate table.',
        nonTechnical:
          'The app only keeps one kind of money. After a weekend in Montreal the roommates could not agree what a Canadian dollar was worth in their usual money, and they argued over a few dollars. They decided to pick one number themselves before typing a bill in, instead of teaching the app about exchange rates.',
      },
      evidence: [
        { kind: 'discussion', number: 7, quote: 'Can tally do Canadian dollars from Montreal?' },
        { kind: 'comment', id: 'disc5-maya', quote: "we still don't agree on the kiosk rate" },
        { kind: 'comment', id: 'disc5-lena', quote: 'Not building a rate table.' },
        { kind: 'file', path: 'docs/how-it-works.md', at: 'c-docs', quote: 'Type the amount in cents.' },
        { kind: 'file', path: 'tally/store.py', at: 'c-json', quote: 'data["entries"]' },
      ],
      onlyOutsideGit: ["we still don't agree on the kiosk rate"],
    },
    {
      id: 'who-settle',
      view: 'timeline',
      facet: 'who',
      question: 'Who should someone ask about how settle-up turns balances into payments?',
      answers: {
        technical:
          'Lena Voss (lenavoss). She added tally/settle.py in c-settle (PR #12, 2023-06-24) and is the only author of that file. c-codeowners (2023-10-21) lists /tally/settle.py @lenavoss. docs/how-it-works.md says to ask Lena if a payment looks wrong. Owen reviewed PR #12. Maya uses the output.',
        nonTechnical:
          'Ask Lena Voss. She wrote the part that turns balances into payments. Owen Briggs looks over her changes, and Maya Ruiz uses the app day to day.',
      },
      evidence: [
        { kind: 'file', path: '.github/CODEOWNERS', at: 'c-codeowners', quote: '/tally/settle.py  @lenavoss' },
        { kind: 'file', path: 'docs/how-it-works.md', at: 'c-docs', quote: 'Ask Lena if a payment looks wrong.' },
        { kind: 'pr', number: 12, quote: 'Settle up with the fewest payments' },
        { kind: 'commit', key: 'c-settle', quote: 'settle: greedy fewest transfers' },
        { kind: 'comment', id: 'pr7-rv-owen-2', quote: 'fewest-payments looks right.' },
      ],
    },
    {
      id: 'pay-from-maya',
      view: 'timeline',
      facet: 'who',
      question: 'Which feature came straight from a roommate who does not write code?',
      answers: {
        technical:
          'The pay command. Maya opened discussion #5 on 2023-04-16 asking to record a Venmo for the ikea lamp without deleting the expense. Owen built tally pay in PR #6 (merged 2023-05-13): add_payment in tally/ledger.py and the pay subcommand in tally/cli.py. The PR body says Maya asked for it in discussion #5.',
        nonTechnical:
          'Maya asked for a way to record that she had already paid Lena back, without erasing the original bill. In May 2023 the team added a payback command so the app would stop saying she still owed that money.',
      },
      evidence: [
        { kind: 'discussion', number: 5, quote: "I venmo'd Lena 40 dollars" },
        { kind: 'comment', id: 'disc3-owen', quote: 'I can add a pay line' },
        { kind: 'pr', number: 6, quote: 'Maya asked for this in discussion #5.' },
        { kind: 'file', path: 'tally/ledger.py', at: 'c-pay', quote: 'def add_payment(balances, src, dst, cents):' },
        { kind: 'comment', id: 'pr4-maya', quote: 'The lamp is still there and it no longer says I owe Lena.' },
      ],
    },
    {
      id: 'web-closed',
      view: 'timeline',
      facet: 'decision',
      question: 'Why was the local web page never added?',
      answers: {
        technical:
          'PR #14 (Kit, opened 2023-08-12, closed unmerged 2023-08-19) added tally/web.py, a page on 127.0.0.1:8765. Lena requested changes: she did not want a server on the living room laptop. Maya said she does not need a website. Kit closed it. The file never landed on main.',
        nonTechnical:
          'A part-time helper tried to add a web page so Maya would not have to use the terminal. Lena did not want a program running on the living room laptop, and Maya said she did not need a website, so they dropped it.',
      },
      evidence: [
        { kind: 'pr', number: 14, quote: 'Local web page for balances (WIP)' },
        { kind: 'comment', id: 'pr8-thread-lena', quote: "I don't want a server on the living room laptop." },
        { kind: 'comment', id: 'pr8-maya', quote: "I don't need a website." },
        { kind: 'comment', id: 'pr8-kit', quote: 'Closing this.' },
      ],
    },
    {
      id: 'storage-now',
      view: 'docs',
      facet: 'how',
      question: 'What stores the bills now, and how does that work?',
      answers: {
        technical:
          'As of c-json (PR #18, 2023-10-07) and the README fix in c-readme-fix, tally/store.py load and save use json and the default path in tally/cli.py is ledger.json. An expense row has kind, date, payer, cents, note, and split. A payment row has kind, date, src, dst, cents, and note. save writes {"entries": rows}. ADR-0004 is Accepted. ADR-0002 has been superseded since c-adr4.',
        nonTechnical:
          'The app keeps every bill and payback in one plain text file next to the app. Adding a bill or a payback rewrites that file. The small database file from the summer is no longer used.',
      },
      evidence: [
        { kind: 'file', path: 'tally/store.py', at: 'c-json', quote: 'json.dump({"entries": rows}, fh, indent=2)' },
        { kind: 'file', path: 'tally/cli.py', at: 'c-json', quote: 'default="ledger.json"' },
        { kind: 'file', path: 'docs/adr/0004-store-the-ledger-in-a-json-file.md', at: 'c-adr4', quote: 'tally/store.py writes ledger.json' },
        { kind: 'file', path: 'docs/how-it-works.md', at: 'c-docs', quote: 'It is a plain' },
        { kind: 'file', path: 'README.md', at: 'c-readme-fix', quote: 'The ledger is a plain JSON file named ledger.json.' },
      ],
    },
    {
      id: 'how-settle',
      view: 'docs',
      facet: 'how',
      question: 'How does settle-up compute the fewest payments?',
      answers: {
        technical:
          'minimal_transfers in tally/settle.py sorts debtors and creditors by descending amount, then by name (key=lambda item: (-item[1], item[0])). It repeatedly pays min(largest debt, largest credit) until both sides are clear, so there are fewer payments than people with a non-zero balance. docs/how-it-works.md states the same rule. tests/test_settle.py at c-remainder pins a two-payment case: maya pays lena 300, then owen pays lena 200.',
        nonTechnical:
          'The app lines up whoever owes the most with whoever is owed the most, and has the first pay the second as much as they can. It repeats that until nobody owes anything. If two people owe the same amount, it picks the one whose name comes first in the alphabet, so the same bills always print the same payments.',
      },
      evidence: [
        { kind: 'file', path: 'tally/settle.py', at: 'c-settle', quote: 'key=lambda item: (-item[1], item[0])' },
        { kind: 'file', path: 'tally/settle.py', at: 'c-settle', quote: 'pay = min(debtors[i][1], creditors[j][1])' },
        { kind: 'file', path: 'docs/how-it-works.md', at: 'c-docs', quote: 'matches the person who owes the most with the person who is owed the most' },
        { kind: 'file', path: 'tests/test_settle.py', at: 'c-remainder', quote: '("maya", "lena", 300), ("owen", "lena", 200)' },
        { kind: 'comment', id: 'pr11-thread-owen', quote: 'Ties really do go by name.' },
      ],
    },
    {
      id: 'adrs-current',
      view: 'docs',
      facet: 'adr',
      question: 'Which written decisions are still in force, and which were replaced?',
      answers: {
        technical:
          'docs/adr/ has four records. ADR-0001 (record decisions), ADR-0003 (integer cents), and ADR-0004 (JSON file) are Accepted at c-readme-fix. ADR-0002 (SQLite) has read "Status: Superseded by ADR-0004" since c-adr4 in PR #18 (2023-10-08). ADR-0004 carries "Supersedes: ADR-0002". docs/index.md lists the same statuses.',
        nonTechnical:
          'The team has four written decision records. Three still apply: write decisions down, keep money as whole cents, and keep the bill list in a plain text file. The one about the small database file was replaced in October 2023.',
      },
      evidence: [
        { kind: 'file', path: 'docs/adr/0002-store-the-ledger-in-sqlite.md', at: 'c-adr4', quote: 'Status: Superseded by ADR-0004' },
        { kind: 'file', path: 'docs/adr/0004-store-the-ledger-in-a-json-file.md', at: 'c-readme-fix', quote: 'Supersedes: ADR-0002' },
        { kind: 'file', path: 'docs/adr/0001-record-architecture-decisions.md', at: 'c-readme-fix', quote: 'Status: Accepted' },
        { kind: 'file', path: 'docs/adr/0003-amounts-are-integer-cents.md', at: 'c-readme-fix', quote: 'Status: Accepted' },
        { kind: 'file', path: 'docs/index.md', at: 'c-readme-fix', quote: 'Store the ledger in a SQLite database. Superseded by ADR-0004.' },
      ],
    },
    {
      id: 'docs-currency-gap',
      view: 'docs',
      facet: 'unwritten-why',
      question: 'The app only keeps one kind of money. Do the docs say why?',
      answers: {
        technical:
          'No. docs/how-it-works.md and the README never mention currencies or exchange rates. Amounts are cents and the row shape has no currency field. The reason lives only in discussion #7, where Maya says they still do not agree on the kiosk rate after the Montreal weekend.',
        nonTechnical:
          'No. The guide never says why the app keeps only one kind of money. That reason lives only in a conversation from May 2023, where the roommates described arguing about an exchange rate.',
      },
      evidence: [
        { kind: 'file', path: 'docs/how-it-works.md', at: 'c-readme-fix', quote: 'Type the amount in cents.' },
        { kind: 'file', path: 'README.md', at: 'c-readme-fix', quote: 'smallest set of payments that settles everyone up.' },
        { kind: 'comment', id: 'disc5-maya', quote: "we still don't agree on the kiosk rate" },
      ],
      onlyOutsideGit: ["we still don't agree on the kiosk rate"],
    },
    {
      id: 'docs-cent-gap',
      view: 'docs',
      facet: 'unwritten-why',
      question: 'Where is the leftover-cent rule written down, if not in the docs?',
      answers: {
        technical:
          'Nowhere in the repository. docs/how-it-works.md, the README, and ADR-0003 do not state the policy. ADR-0003 says splitting a bill that does not divide evenly is a separate question and "This record does not answer it." The policy is only in the PR #12 review thread. After c-remainder, add_expense floors with cents // len(names) and has no comment.',
        nonTechnical:
          'The guide never says what happens to a leftover cent. The written decision about whole cents even says that question is separate and unanswered. The reason lives only in a conversation from June 2023.',
      },
      evidence: [
        { kind: 'file', path: 'docs/adr/0003-amounts-are-integer-cents.md', at: 'c-adr3', quote: 'This record does not answer it.' },
        { kind: 'file', path: 'docs/how-it-works.md', at: 'c-docs', quote: 'Type the amount in cents.' },
        { kind: 'comment', id: 'pr7-thread-lena', quote: 'the remainder rides with the payer' },
        { kind: 'file', path: 'tally/ledger.py', at: 'c-remainder', quote: 'each = cents // len(names)' },
        { kind: 'file', path: 'tests/test_settle.py', at: 'c-remainder', quote: 'balances["lena"], -333' },
      ],
      onlyOutsideGit: ['remainder rides with the payer'],
    },
    {
      id: 'declined-texts',
      view: 'timeline',
      facet: 'decision',
      question: 'Was the request for text reminders accepted?',
      answers: {
        technical:
          'No. Issue #13, opened by Maya on 2023-07-22, asked for a text when she owes someone. Lena\'s final comment says they are not adding texts. Owen closed it as not planned on 2023-07-25. This is separate from PR #14, which declined a local web page.',
        nonTechnical:
          'No. Maya asked if the app could text her when she owed someone. Lena decided not to add that. Owen closed the request. This is separate from the web page they also turned down.',
      },
      evidence: [
        { kind: 'issue', number: 13, quote: 'Can tally text me when I owe someone?' },
        { kind: 'comment', id: 'iss13-lena', quote: 'We are not adding texts.' },
        { kind: 'comment', id: 'iss13-owen', quote: 'Closing this as not planned.' },
      ],
    },
    {
      id: 'spaces-from-maya',
      view: 'timeline',
      facet: 'who',
      question: 'Which stored-list change started from a note Maya wrote in plain language?',
      answers: {
        technical:
          'Issue #8 (Maya, 2023-05-28) says a two-word note breaks the list. PR #9 (Kit, merged 2023-06-18) says Fixes #8 and replaces the text store with sqlite3 so a note can contain a space.',
        nonTechnical:
          'Maya wrote that typing ikea lamp made the list break. Kit then changed how the list is stored so a note can contain a space. That change landed in June 2023.',
      },
      evidence: [
        { kind: 'issue', number: 8, quote: 'ikea lamp breaks the list' },
        { kind: 'comment', id: 'iss8-kit', quote: 'so the note can have spaces' },
        { kind: 'pr', number: 9, quote: 'Fixes #8.' },
      ],
    },
    {
      id: 'ci-caught-import',
      view: 'timeline',
      facet: 'how',
      question: 'What did the failing test run on the settle-up change catch, and was it the leftover-cent rule?',
      answers: {
        technical:
          'No. PR #12 commit c-settle imports minimal_transfer, which is not a name in tally/settle.py. The smoke check on that commit failed with ImportError. c-settle-import, pushed 2023-06-28 after Owen requested changes and before he approved, renames the import to minimal_transfers. The later smoke check passed. The leftover-cent policy was not what the check caught.',
        nonTechnical:
          'No. An automated test run on Lena\'s settle-up change failed because the app looked for a helper under the wrong name. She fixed the name before the change was accepted, and the test run passed. The failure was not about leftover cents.',
      },
      evidence: [
        { kind: 'file', path: 'tally/cli.py', at: 'c-settle', quote: 'from tally.settle import minimal_transfer' },
        { kind: 'comment', id: 'pr12-gha-fail', quote: 'cannot import name minimal_transfer' },
        { kind: 'file', path: 'tally/cli.py', at: 'c-settle-import', quote: 'from tally.settle import minimal_transfers' },
        { kind: 'commit', key: 'c-settle-import', quote: 'cli: import minimal_transfers' },
      ],
    },
    {
      id: 'noise-who-wrote',
      view: 'timeline',
      facet: 'noise',
      job: 'find-context',
      question: 'How many distinct people wrote the app, if a laptop shows a second name for Lena?',
      answers: {
        technical:
          'Three people wrote product code: Lena Voss, Owen Briggs, and Kit Alvarez. c-dollars and c-usage are authored in git as Lena P <lena@laptop.local> with no linked login, but that identity belongs to lenavoss. She says so on PR #3, and Kit repeats it on PR #20. The squash of PR #3 on main is authored as Lena Voss, not as Lena P. dependabot[bot] only changed the actions/checkout pin in the test workflow in PR #17 and did not change product behavior. That squash on main is authored by dependabot[bot].',
        nonTechnical:
          'Three people wrote the app: Lena, Owen, and Kit. A laptop of Lena\'s signed some changes as Lena P, but that is still Lena. An automated helper later updated a setup file and did not change how bills are split.',
      },
      evidence: [
        { kind: 'comment', id: 'pr3-lena', quote: 'lena@laptop.local' },
        { kind: 'comment', id: 'pr3-lena', quote: 'That is still me.' },
        { kind: 'comment', id: 'pr20-kit', quote: 'lena@laptop.local is not linked' },
        { kind: 'commit', key: 'c-dollars', quote: 'print dollars, not raw cents' },
      ],
    },
    {
      id: 'noise-fix-tests',
      view: 'timeline',
      facet: 'noise',
      job: 'catch-up',
      question: 'What did the change labeled "fix tests" actually change?',
      answers: {
        technical:
          'c-fix-tests (Owen, 2023-11-12) is titled fix tests. It also changes tally/cli.py so add and pay reject a negative cent amount, and it adds tests/test_cli.py. The message does not mention that behavior change.',
        nonTechnical:
          'A note labeled as a test fix also stopped the app from accepting a negative amount. The note does not say that. A new bill and a payback now refuse a negative amount.',
      },
      evidence: [
        { kind: 'commit', key: 'c-fix-tests', quote: 'fix tests' },
        { kind: 'file', path: 'tally/cli.py', at: 'c-fix-tests', quote: 'if args.cents < 0:' },
        { kind: 'file', path: 'tests/test_cli.py', at: 'c-fix-tests', quote: 'def test_negative_cents_rejected' },
      ],
    },
    {
      id: 'noise-bot-behavior',
      view: 'timeline',
      facet: 'noise',
      job: 'catch-up',
      question: 'Did the automated dependency update change how bills are split or stored?',
      answers: {
        technical:
          'No. PR #17, opened by dependabot[bot], only changes .github/workflows/test.yml from actions/checkout v3 to v4. setup-python stays at v4. Commit c-bump touches that file and nothing else. Product behavior is unchanged.',
        nonTechnical:
          'No. An automated helper updated a setup file used to run the tests. It did not change how bills are split or stored.',
      },
      evidence: [
        { kind: 'file', path: '.github/workflows/test.yml', at: 'c-bump', quote: 'actions/checkout@v4' },
        { kind: 'file', path: '.github/workflows/test.yml', at: 'c-bump', quote: 'actions/setup-python@v4' },
        { kind: 'commit', key: 'c-bump', quote: 'Bump actions/checkout from 3 to 4' },
      ],
    },
    {
      id: 'noise-text-edit',
      view: 'timeline',
      facet: 'noise',
      job: 'why',
      question: 'Lena first agreed to add text messages. What was the final decision?',
      answers: {
        technical:
          'The final text is the decision. On issue #13, comment iss13-lena first said she would add a text next weekend. She edited it to say they are not adding texts. Owen then closed the issue as not planned. The edited wording is the one that stands.',
        nonTechnical:
          'Lena first wrote that she would add text messages next weekend. She changed that note. The wording people see now says they are not adding texts. That later wording is the decision.',
      },
      evidence: [
        { kind: 'comment', id: 'iss13-lena', quote: 'Yes, I can add a text next weekend.', revision: 0 },
        { kind: 'comment', id: 'iss13-lena', quote: 'We are not adding texts.' },
        { kind: 'comment', id: 'iss13-owen', quote: 'Closing this as not planned.' },
      ],
    },
    {
      id: 'noise-kit-time',
      view: 'timeline',
      facet: 'noise',
      job: 'catch-up',
      question: 'What local time did Kit fix the roommates spelling, and in what clock?',
      answers: {
        technical:
          'The git author date on c-typo is 2023-04-02T15:14:00-07:00. That instant is 2023-04-02T22:14:00Z. London was on British Summer Time (UTC+1), so 15:14 in Oakland was 23:14 in London, eight hours later. Kit wrote that the typo went in Sunday at 3:14pm his time. April 2, 2023 was a Sunday. The offset is visible in his git commits, which use -07:00. GitHub shows UTC for reviews, comments, and issues. He has no git commit after daylight saving ended on Nov 5, so the -08:00 stamps on later comments are not in git.',
        nonTechnical:
          'Kit fixed the roommates spelling on Sunday, April 2, 2023, at 3:14 in the afternoon, his time in Oakland. London was on summer time that day, so his clock was eight hours behind London.',
      },
      evidence: [
        { kind: 'commit', key: 'c-typo', quote: 'fix typo: roomates' },
        { kind: 'comment', id: 'disc3-kit', quote: 'Sunday at 3:14pm my time' },
      ],
    },
    {
      id: 'noise-web-claim',
      view: 'timeline',
      facet: 'noise',
      job: 'why',
      question: 'Did Maya ask for the local web page?',
      answers: {
        technical:
          'No. On PR #14 Kit wrote that Maya asked for the page in the group chat. Maya replied that she never asked for one and that she asked Owen to type the groceries. Her reply is the correction. The page was closed without landing.',
        nonTechnical:
          'No. Kit said Maya had asked for a web page. Maya said she had not. She had asked Owen to type the groceries. They did not add the page.',
      },
      evidence: [
        { kind: 'comment', id: 'pr14-kit-claim', quote: 'Maya asked me for this page' },
        { kind: 'comment', id: 'pr8-maya', quote: 'I never asked for one.' },
        { kind: 'comment', id: 'pr8-maya', quote: "I don't need a website." },
      ],
    },
  ],
  noise: [
    {
      id: 'noise-identity-split',
      kind: 'identity-split',
      description:
        'Lena Voss also commits as Lena P <lena@laptop.local> with linked false, on c-usage (PR #3) and c-dollars (direct to main). Git shows a second name and no login. The truth is one person, lenavoss. She says so on PR #3, and Kit notes the dollars change on PR #20. The squash of PR #3 on main is authored as Lena Voss. c-usage on the pull request head remains Lena P.',
      evidence: [
        { kind: 'comment', id: 'pr3-lena', quote: 'lena@laptop.local' },
        { kind: 'comment', id: 'pr20-kit', quote: 'That is her laptop.' },
        { kind: 'commit', key: 'c-dollars', quote: 'print dollars, not raw cents' },
      ],
    },
    {
      id: 'noise-misleading-message',
      kind: 'misleading-message',
      description:
        'c-fix-tests is titled "fix tests" but also rejects negative cent amounts in tally add and tally pay. The new test covers that refusal. The message understates the behavior change. The leftover-cent follow-up remains c-remainder, message "ledger: floor the split", and is not this commit.',
      evidence: [
        { kind: 'commit', key: 'c-fix-tests', quote: 'fix tests' },
        { kind: 'file', path: 'tally/cli.py', at: 'c-fix-tests', quote: 'cents must be zero or more' },
      ],
    },
    {
      id: 'noise-bot',
      kind: 'bot-noise',
      description:
        'dependabot[bot] opened PR #17 to bump actions/checkout from 3 to 4. It was squash-merged, authored on main by dependabot[bot], and did not change tally product code. github-actions[bot] comments on that PR and on the settle-up PR when smoke fails and then passes.',
      evidence: [
        { kind: 'pr', number: 17, quote: 'Bumps [actions/checkout](https://github.com/actions/checkout) from 3 to 4.' },
        { kind: 'comment', id: 'pr17-gha', quote: 'test: success.' },
        { kind: 'comment', id: 'pr12-gha-fail', quote: 'Smoke failed:' },
      ],
    },
    {
      id: 'noise-duplicate',
      kind: 'duplicate',
      description:
        'Issue #11 (Kit) repeats Maya\'s request in issue #10 about balances not saying who to pay. Owen closed #11 as a duplicate of #10. The settle-up PR later closes #10. #11 is not a separate feature.',
      evidence: [
        { kind: 'issue', number: 11, quote: 'balances still do not say who to pay' },
        { kind: 'comment', id: 'iss11-owen', quote: 'same request as #10' },
        { kind: 'issue', number: 10, quote: 'it prints three numbers and I still do not know who to pay' },
      ],
    },
    {
      id: 'noise-corrected-claim',
      kind: 'corrected-claim',
      description:
        'On PR #14 Kit claims Maya asked for the web page in the group chat. Maya\'s later comment is the truth: she never asked for a website, and she asked Owen to type the groceries.',
      evidence: [
        { kind: 'comment', id: 'pr14-kit-claim', quote: 'Maya asked me for this page in the group chat' },
        { kind: 'comment', id: 'pr8-maya', quote: 'I never asked for one.' },
      ],
    },
    {
      id: 'noise-edited-comment',
      kind: 'edited-comment',
      description:
        'On issue #13 Lena\'s comment first said she would add a text next weekend. The edit reverses that: they are not adding texts. The current text is the truth. Owen closed the issue as not planned after the edit.',
      evidence: [
        { kind: 'comment', id: 'iss13-lena', quote: 'Yes, I can add a text next weekend.', revision: 0 },
        { kind: 'comment', id: 'iss13-lena', quote: 'We are not adding texts.' },
      ],
    },
    {
      id: 'noise-squash',
      kind: 'squash-merge',
      description:
        'PR #3 (the decimal sentence) and PR #17 (the actions/checkout pin) landed with method squash. Their branch commits are not separate commits on main. Each squash commit on main is authored by the pull request author and committed by GitHub: Lena Voss for #3, dependabot[bot] for #17. Owen merged #3 and Lena merged #17. Those clicks are not the git author. The usage commit still exists on the pull request head, authored as Lena P.',
      evidence: [
        { kind: 'pr', number: 3, quote: 'Print a sentence when cents is not a whole number' },
        { kind: 'pr', number: 17, quote: 'Bump actions/checkout from 3 to 4' },
      ],
    },
    {
      id: 'noise-timezone',
      kind: 'timezone',
      description:
        'Kit Alvarez commits from Oakland (Pacific). The offset is visible in his git commits, which use -07:00. c-typo is 2023-04-02T15:14:00-07:00 in git, which is 22:14 UTC. He calls that Sunday at 3:14pm his time. Daylight saving ended on Nov 5. Comments and the review reply after that are stamped -08:00 in the spec, but GitHub shows UTC, so the offset is not on his reviews, comments, or issues. Other people commit on Z.',
      evidence: [
        { kind: 'commit', key: 'c-typo', quote: 'fix typo: roomates' },
        { kind: 'comment', id: 'disc3-kit', quote: '3:14pm my time' },
      ],
    },
    {
      id: 'noise-off-topic',
      kind: 'off-topic',
      description:
        'Discussion #15 starts as whose turn Costco is, then drifts to Owen\'s dead sourdough starter and a blinking router. Lena pulls it back to the olive oil and tally. It is not about storage, settle, or currency.',
      evidence: [
        { kind: 'discussion', number: 15, quote: 'Not really a tally question.' },
        { kind: 'comment', id: 'disc15-owen', quote: 'killed the sourdough starter' },
        { kind: 'comment', id: 'disc15-lena', quote: 'The router and the jar are not this thread.' },
      ],
    },
    {
      id: 'noise-dangling',
      kind: 'dangling-reference',
      description:
        'Issue #21 mentions #19. Owen opened #19 and then deleted it, so GitHub skipped the number and the link dangles. #19 is not an issue, pull request, or discussion. The open rent request is #21, not a continuation of the deleted item.',
      evidence: [
        { kind: 'issue', number: 21, quote: 'I cannot find #19' },
      ],
    },
  ],
};

export default spec;
