# eventlog/answer.py: the whole integration surface of a storage prototype.
# The harness runs: python3 -m eventlog.answer <workspace> <state>, request on stdin, response on stdout.
import json
import sys
from pathlib import Path

from eventlog.store import EventStore          # the prototype's own code
from eventlog.reason import answer_question    # returns findings with .basis, .text, .sources


def to_statement(finding):
    statement = {"basis": finding.basis, "text": finding.text}
    if finding.basis != "unknown":
        statement["cite"] = [
            {"ref": source.locator, "quote": source.excerpt} if source.excerpt else {"ref": source.locator}
            for source in finding.sources
        ]
    return statement


def main():
    workspace, state = Path(sys.argv[1]), Path(sys.argv[2])
    request = json.load(sys.stdin)
    store = EventStore.open_readonly(state / "events.sqlite", repo=workspace / "repo")
    response = {}
    usage = None
    for audience in request["audiences"]:
        findings, usage = answer_question(store, request["question"], audience=audience)
        response[audience] = [to_statement(f) for f in findings]
    if usage is not None:
        response["usage"] = usage
    json.dump(response, sys.stdout)


if __name__ == "__main__":
    main()
