---
'@rexezuge/tooling': patch
---

`defineRepoLintConfig` works on `eslint-plugin-unicorn` v78.

v78 dropped the `flat/`-prefixed aliases and exports the flat configs
directly, so `configs['flat/recommended']` is `undefined` there — and the
config object built around it is `undefined` too, which ESLint rejects
outright with "Unexpected undefined config". The factory therefore only
worked on the major it was written against, while the peer range said
`^76.0.0` and every repo in the family had moved to 78.

The preset is now read from whichever spelling the installed major
publishes, and the peer range admits both. The rest of the config is
unchanged: this is the same rule set, reachable on the version the family
actually runs.
