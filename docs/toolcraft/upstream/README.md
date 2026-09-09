# Upstream patch for the framework changes this app carries

This app modifies 49 framework files and adds 10 more under `src/toolcraft/`.
The integrity manifest is signed, so those changes can never verify here: the
manifest can only be reissued by whoever holds the framework's private key.
`timeline-and-runtime.patch` exists so that reissuing it is a review rather
than an archaeology exercise.

## What the patch is

`diff -ruN` from each file's pristine content — the version whose SHA-256
matches `src/toolcraft/.toolcraft-manifest.json` — to the version this app
ships. 59 files, +4613 / -377.

Every pristine version was recovered from this repository's own history by
searching each file's commits for the blob matching its manifest hash, so the
"before" side is the framework's, not a guess.

## It is verified against the manifest, not against a memory

Applied to a tree of those pristine files, the patch reproduces this app's
`src/toolcraft/` exactly: all 670 files hash-identical, 0 differing, nothing
extra. The pristine tree itself is checked the same way, and all 659 files the
manifest names hash to the value it records. The check is reproducible — see
the worklog entry for the method.

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

Ten of the 59 are not timeline work and should be judged separately.
`ui/components/primitives/slider/slider-parts.tsx` makes a slider state its own
range so an orientation proof can read it, and the export files sit behind the
AV1 fallback and the frame rate.

`ui/components/control-layout/index.tsx` is the one to read first, because it
is a plain bug and nothing to do with this app. A controls-panel section header
stops propagation on the buttons beside its title, so a press on Reset or
Collapse does not also toggle the section — but it stopped *every* key, and the
runtime's undo and redo are document listeners on the bubble phase. Collapsing
any section left focus on the button that collapsed it, and Control+z silently
did nothing from then on. It now stops only the two keys the header acts on.

The other three make the runtime Setup section collapsible and start it
collapsed: `runtime/react/controls-panel/layout/controls-panel-section.tsx`,
`runtime/state/create-template-state.ts` and `runtime/schema/runtime-section-titles.ts`,
with `runtime/schema/runtime-setup-section.ts` following the section id out to a
constant. That reverses two rules stated in `component-contracts.runtime.ts` and
amends them in the same change rather than leaving the contract contradicting
the code; the reasoning is in the worklog.

Three of the 59 sit in the controls panel
rather than the timeline panel, which is worth flagging because that is a
surface the exception had not reached before:
`runtime/react/controls-panel/keyframes/controls-panel-keyframes.tsx`,
`runtime/react/controls-panel/layout/controls-panel-control-group.tsx` and
`runtime/react/controls-panel/conditions/control-conditions.ts`. They are what
makes a keyframed control's number in the panel read the playhead, and what
makes changing that number key the frame the playhead is on rather than
whichever keyframe was last selected. Both are general: they are how a keyframe
editor is expected to behave, and neither knows anything about this product.
The one contract line they read against is quoted and argued with in the
worklog rather than left unmentioned.

Six more are the newest work and are the only ones that touch the camera:
`runtime/state/timeline-orientation-interpolation.ts` is the addition, and
`runtime/state/keyframe-evaluation.ts`, `runtime/schema/keyframe-capability.ts`,
`runtime/state/orientation-pose.ts`,
`runtime/react/controls-panel/values/controls-panel-value-labels.ts` and
`runtime/state/types.ts` with `runtime/state/timeline-reducer.ts` are the rest.
Together they let an orientation be keyframed at all. The runtime refused it —
`keyframeable: false` was required on every orientation gizmo — and the reason
was sound while every keyframed value was interpolated component by component,
because doing that to a camera pose sends the camera through the product rather
than around it. The evaluator now carries a direction around the sphere and its
distance along a straight line, so the rule it was protecting no longer holds
and the contract lines stating it are amended in the same change rather than
left contradicting the code. The two command fields are separate and general: a
keyframe write can now merge into a history group the way a value write always
could, which is what makes a gesture that keys as it goes one thing to undo.

The newest change adds no files to this list. `state/types.ts`,
`state/timeline-reducer.ts` and `state/reducer.ts` were already on it, and they
carry one new command: `timeline.setControlKeyframes`, which replaces whole
tracks in a single patch. It exists because a preset is one statement about
what the timeline holds rather than a sequence of edits — built out of a delete
and a keyframe-per-write, applying one put more than a dozen entries in the
history for a single press, and merging those is lossy because a delete patch
also carries the value each cleared control falls back to. It is general: any
caller that wants to set a track rather than edit one wants this, and the
runtime's own `panels.timeline.animations` would be simpler expressed through
it. The same change lets a keyframe be created already carrying its curve,
which is what a preset needs and what an edit made by hand should not have.

The newest change adds four export files to this list —
`runtime/export/artifact-export-settings.ts`, `runtime/export/video-frame-schedule.ts`,
`runtime/export/video-artifact-export.ts` and `runtime/export/index.ts` — beside
the two already on it, and is the one change here that is a bug fix rather than
a capability. The frame rate was a literal 30 in four places across three files:
the schedule that lays the frames out, the encoder that declares the rate, the
bitrate formula where it did not look like a rate at all, and the product's
motion blur, whose idea of how long a frame is has to be the same number. Four
copies with nothing making them agree, so the first one to change alone would
have been wrong. They are one resolved setting now, and the schedule refuses a
rate it cannot lay frames out at rather than dividing by it. The bitrate charges
a frame past the baseline half of what a baseline frame costs, which leaves
every thirty-frame export byte-for-byte the export it was. It is general: no
part of it knows what is being filmed, and a runtime that only ever encoded at
thirty was the thing being fixed.

## What this patch does not do

It does not make `verify:delivery` pass. Nothing done inside this repository
can, because the gate is a signature. This is the material for the
conversation that can.
