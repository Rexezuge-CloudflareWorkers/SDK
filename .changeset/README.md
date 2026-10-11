# Changesets

This repo versions all eight `@rexezuge/*` packages in lockstep via
[Changesets](https://github.com/changesets/changesets) (see `.changeset/config.json`
`fixed` group).

## Adding a changeset

Every PR that touches `packages/*` must add one markdown file in this directory:

```md
---
"@rexezuge/errors": patch
"@rexezuge/d1": patch
---

Short description of the change.
```

Use `minor` for new features and `major` for breaking changes. Because the
packages are in a `fixed` group, the highest bump in the release wins and all
eight packages move to the same version together.

Generate one interactively with:

```bash
pnpm changeset
```

## How releases work

1. Merge PRs with changeset files into `main`.
2. The `Version Packages` workflow opens/updates a `CHORE: Version Packages` PR
   that bumps versions and changelogs (`pnpm changeset version`).
3. Merge that PR, then cut a GitHub Release. The `Publish` workflow runs
   `pnpm changeset publish`, which publishes every package whose version is not
   yet on the registry.

Never run `pnpm -r publish` directly: without a version bump the registry
already has the local version and pnpm reports
`There are no new packages that should be published`.
