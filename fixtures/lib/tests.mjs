/**
 * What a test file is, read by the generator, the harness, and the engine, so an example the generator accepts in gold
 * is one the harness scores and one the engine offers. Paths are repo-relative with forward slashes.
 *
 * In order: a test directory (Python and Rust tests/, Ruby test/, Java src/test/), Jest __tests__/, pytest test_*.py
 * and *_test.py, Go *_test.go, JS and TS *.test.* and *.spec.*, and RSpec *_spec.rb.
 */
const TEST_FILES = [
  /(?:^|\/)tests?\//,
  /(?:^|\/)__tests__\//,
  /(?:^|\/)(?:test_[^/]*|[^/]*_test)\.py$/,
  /_test\.go$/,
  /\.(?:test|spec)\.[^/.]+$/,
  /_spec\.rb$/,
];

/** @param {string} path */
export function isTestFile(path) {
  return TEST_FILES.some((pattern) => pattern.test(path));
}
