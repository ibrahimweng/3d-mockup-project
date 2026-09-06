# Working in this repository

`AGENTS.md` holds the framework's rules about the code itself, and it is
protected and signed, so do not edit it. This file holds how the owner of this
repository wants work delivered. Where the two overlap, `AGENTS.md` decides what
the code may look like and this file decides how it gets to `main`.

## Always open a pull request, and merge it once it is green

Do not stop at a pushed branch and do not ask whether to open a pull request.
Standing instruction from the repository owner, for every change:

1. Work on a branch.
2. Push it.
3. Open a pull request against `main`.
4. Wait for the checks.
5. Merge it once they pass.

Squash on merge, so one pull request is one commit on `main`.

Do not merge while anything is still running, and do not merge a red check. If a
check fails, fix the cause and push again. If it cannot be fixed, say what is
blocking rather than merging past it.

If the pull request for a branch has already been merged, that branch is
finished. Start again from the latest `main` under the same name, and open a new
pull request for the follow-up.

## What green means

`.github/workflows/ci.yml` runs two jobs, and both have to pass.

**Types, docs and tests** runs these in order:

```bash
npm run typecheck
npm run docs:check
npm test
npm run build
```

**Product boundary** runs `npm run ai:check` and compares what it reports
against `.github/product-boundary-baseline.txt`.

Run all of them locally before pushing. `npm test` is the one that catches most
things, because it also runs the acceptance evidence reporter, which fails when
a requirement in `src/app/app-acceptance-subject.ts` names a test that does not
exist.

## The boundary baseline is a record, not a place to hide things

`npm run ai:check` reports three violations today, all in
`src/app/render/device-assets.ts`. They are listed in
`.github/product-boundary-baseline.txt`, and the CI job fails on anything that
is not on that list.

Do not add a new violation to that file to get a build green. The file explains
what the three are and what would have to change to reach zero. A new violation
is something to fix. If you believe one genuinely belongs on the list, say why
and let the owner decide.

## Still open

`public/models/CREDITS.md` has blanks in it. Nothing in this repository records
where the nine product models came from or what their licences allow, and the
built files are served as downloads under an MIT licence. Only the owner can
fill those in. Do not guess at a source or a licence, and do not remove the
blanks to tidy the file up.
