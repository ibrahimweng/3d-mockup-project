# Upstream patch for the framework changes this app carries

This app modifies 32 framework files and adds 4 more under `src/toolcraft/`.
The integrity manifest is signed, so those changes can never verify here: the
manifest can only be reissued by whoever holds the framework's private key.
`timeline-and-runtime.patch` exists so that reissuing it is a review rather
than an archaeology exercise.

## What the patch is

`diff -ruN` from each file's pristine content — the version whose SHA-256
matches `src/toolcraft/.toolcraft-manifest.json` — to the version this app
ships. 36 files, +2039 / -193.

Every pristine version was recovered from this repository's own history by
searching each file's commits for the blob matching its manifest hash, so the
"before" side is the framework's, not a guess.

## It is verified against the manifest, not against a memory

Applied to a tree of those pristine files, the patch reproduces this app's
`src/toolcraft/` exactly: 36 of 36 files hash-identical, 0 differing. The
check is reproducible — see the worklog entry for the method.

```
patch -p1 -d <pristine-toolcraft-tree> < timeline-and-runtime.patch
```

## What is in it, and why

The bulk is the timeline, which was rewritten in the runtime rather than
worked around in the product because the user chose that explicitly: a
timeline every generated app gets should be the one worth having. The rest is
small and general. Each change is argued for in `../agent-worklog.md`; the
entries worth reading before reviewing this are the timeline integrity
exception, the continuous-keyframe entry, the transport entry, and the camera
framing fix.

Six of the 36 are not timeline work and should be judged separately.
`ui/components/primitives/slider/slider-parts.tsx` makes a slider state its own
range so an orientation proof can read it, and the export files sit behind the
AV1 fallback. The other three make the runtime Setup section collapsible and
start it collapsed — `runtime/react/controls-panel/layout/controls-panel-section.tsx`,
`runtime/state/create-template-state.ts` and `runtime/schema/runtime-section-titles.ts`,
with `runtime/schema/runtime-setup-section.ts` following the section id out to a
constant. That one reverses two rules stated in `component-contracts.runtime.ts`,
and amends those rules in the same change rather than leaving the contract
contradicting the code; the reasoning is in the worklog and should be read
before it is taken.

## What this patch does not do

It does not make `verify:delivery` pass. Nothing done inside this repository
can, because the gate is a signature. This is the material for the
conversation that can.
