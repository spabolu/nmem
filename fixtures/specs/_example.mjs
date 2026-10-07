/** @type {import('../schema.mjs').RepoSpec} */
const spec = {
  slug: '_example',
  name: 'Example',
  owner: 'acme',
  description: 'A tiny fixture covering every step type and every evidence ref.',
  people: {
    ada: { name: 'Ada Lovelace', email: 'ada@example.com', role: 'author' },
    bob: { name: 'Bob Builder', email: 'bob@example.com', role: 'reviewer' },
  },
  steps: [
    {
      type: 'commit',
      key: 'c-init',
      at: '2024-01-01T00:00:00Z',
      author: 'ada',
      message: 'Initial notes for the fixture.',
      files: {
        'README.md': 'Project notes.\nThe first decision lives in git.\n',
        'docs/adr/0001-start.md': 'Record the repository start in git.\n',
      },
    },
    {
      type: 'pr',
      number: 1,
      title: 'Add the greeting',
      author: 'ada',
      body: 'This pull request adds a greeting helper.',
      labels: ['feature'],
      branch: 'greeting',
      openedAt: '2024-01-02T00:00:00Z',
      commits: [
        {
          key: 'c-greet',
          at: '2024-01-02T01:00:00Z',
          author: 'ada',
          message: 'Add greeting helper.',
          files: {
            'src/greet.js': 'export function greet() {\n  return "hello";\n}\n',
          },
        },
      ],
      reviews: [
        {
          id: 'rv-1',
          author: 'bob',
          at: '2024-01-02T02:00:00Z',
          state: 'APPROVED',
          body: 'Looks good to merge.',
          threads: [
            {
              id: 'th-1',
              path: 'src/greet.js',
              line: 2,
              comments: [
                {
                  id: 'cmt-thread-1',
                  author: 'bob',
                  at: '2024-01-02T02:30:00Z',
                  body: 'The return string is hello.',
                },
              ],
            },
          ],
        },
      ],
      comments: [
        {
          id: 'cmt-pr-1',
          author: 'ada',
          at: '2024-01-02T03:00:00Z',
          body: 'The off-git reason is the hallway decision.',
        },
      ],
      outcome: { kind: 'merged', at: '2024-01-02T04:00:00Z', by: 'bob' },
    },
    {
      type: 'pr',
      number: 2,
      title: 'Try a farewell',
      author: 'bob',
      body: 'Closing this without merging.',
      labels: [],
      branch: 'farewell',
      openedAt: '2024-01-03T00:00:00Z',
      commits: [
        {
          key: 'c-farewell',
          at: '2024-01-03T01:00:00Z',
          author: 'bob',
          message: 'Sketch a farewell.',
          files: {
            'src/farewell.js': 'export const farewell = "bye";\n',
          },
        },
      ],
      reviews: [],
      comments: [],
      outcome: { kind: 'closed', at: '2024-01-03T02:00:00Z', by: 'ada' },
    },
    {
      type: 'discussion',
      number: 3,
      title: 'Where should notes live',
      category: 'Ideas',
      author: 'ada',
      at: '2024-01-04T00:00:00Z',
      body: 'Notes can live outside the repository.',
      comments: [
        {
          id: 'cmt-disc-1',
          author: 'bob',
          at: '2024-01-04T01:00:00Z',
          body: 'I agree with keeping some notes out.',
          replies: [
            {
              id: 'cmt-reply-1',
              author: 'ada',
              at: '2024-01-04T02:00:00Z',
              body: 'We will keep that note out of git.',
            },
          ],
        },
      ],
    },
    {
      type: 'tag',
      name: 'v0.1.0',
      at: '2024-01-05T00:00:00Z',
      by: 'ada',
      message: 'First tagged snapshot.',
    },
  ],
  answerKey: [
    {
      id: 'why-greeting',
      view: 'timeline',
      facet: 'decision',
      question: 'Why was the greeting added?',
      answers: {
        technical: 'Pull request 1 added src/greet.js and Bob merged it.',
        nonTechnical: 'The team added a hello helper and merged the change.',
      },
      evidence: [
        { kind: 'pr', number: 1, quote: 'adds a greeting helper' },
        { kind: 'commit', key: 'c-greet', quote: 'Add greeting helper.' },
        { kind: 'file', path: 'src/greet.js', at: 'c-greet', quote: 'return "hello"' },
        { kind: 'comment', id: 'rv-1', quote: 'Looks good to merge.' },
        { kind: 'comment', id: 'cmt-thread-1', quote: 'The return string is hello.' },
      ],
    },
    {
      id: 'first-snapshot',
      view: 'docs',
      facet: 'overview',
      question: 'What did the first snapshot record?',
      answers: {
        technical: 'c-init wrote README.md, and v0.1.0 tags that history.',
        nonTechnical: 'The repo started with a short note and then got a first tag.',
      },
      evidence: [
        { kind: 'commit', key: 'c-init', quote: 'Initial notes for the fixture.' },
        { kind: 'file', path: 'README.md', at: 'c-init', quote: 'The first decision lives in git.' },
        { kind: 'tag', name: 'v0.1.0', quote: 'First tagged snapshot.' },
      ],
    },
    {
      id: 'farewell-why',
      view: 'timeline',
      facet: 'unwritten-why',
      question: 'Why was the farewell pull request closed?',
      answers: {
        technical: 'Pull request 2 was closed unmerged. The reason is only in a pull request comment.',
        nonTechnical: 'They closed the farewell idea. The reason is not written in the code.',
      },
      evidence: [
        { kind: 'pr', number: 2, quote: 'Closing this without merging.' },
        { kind: 'discussion', number: 3, quote: 'outside the repository' },
        { kind: 'comment', id: 'cmt-pr-1', quote: 'hallway decision' },
        { kind: 'comment', id: 'cmt-reply-1', quote: 'keep that note out of git' },
      ],
      onlyOutsideGit: ['hallway decision'],
    },
  ],
};

export default spec;
