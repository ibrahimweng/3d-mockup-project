# Procedural scene geometry (superseded)

Preserved, not deleted. These built the seal and the four devices from code —
superellipse outlines, real millimetre dimensions, merged key caps, cut keyboard
wells — before real GLB models arrived.

They are kept **outside `src/`** deliberately: they are no longer imported, and
leaving unused modules inside the compiled tree means Toolcraft's code-health
and verification-impact gates keep scanning and demanding coverage for code the
product does not run.

`artwork-relief.ts` went with the path tracer. It derived tangent-space normals
from artwork luminance to emboss a mark into metal, which has no equivalent in
the raster pipeline — a real display shows a texture rather than a struck relief.

To revive any of it, move the file back under `src/app/render/` and restore its
`artwork-relief` import.
