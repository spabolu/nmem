import assert from 'node:assert/strict';
import test from 'node:test';
import { isTestFile } from '../fixtures/lib/tests.mjs';

test('a test file is one by any common convention, and code beside it is not', () => {
  const tests = [
    'tests/test_cli.py',
    'tally/test_settle.py',
    'tally/settle_test.py',
    'internal/schedule/assign_test.go',
    'test/limit.test.ts',
    'src/limit.test.ts',
    'web/app.spec.js',
    'src/__tests__/limit.js',
    'spec/models/user_spec.rb',
    'test/models/user_test.rb',
    'tests/integration.rs',
    'src/test/java/org/example/AppTest.java',
  ];
  const code = [
    'tally/settle.py',
    'tally/testing.py',
    'internal/schedule/assign.go',
    'internal/latest/handler.go',
    'src/limit.ts',
    'src/contest.ts',
    'app/models/user.rb',
    'src/main/java/org/example/App.java',
    'src/lib.rs',
    'docs/testing.md',
  ];
  assert.deepEqual(tests.filter((path) => !isTestFile(path)), []);
  assert.deepEqual(code.filter((path) => isTestFile(path)), []);
});
