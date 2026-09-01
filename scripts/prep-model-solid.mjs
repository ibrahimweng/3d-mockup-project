/**
 * Add a solid part to a bought model, for the times the file is missing one.
 *
 * Normally everything here moves what a file already contains and never adds
 * to it: a bought model is somebody's work and the less of it we invent, the
 * more it stays theirs. This exists for the case where a part is not misplaced
 * but absent -- the clipboard's clip has a sprung lever and no jaw, so it can
 * rest on a stack of paper and has nothing to hold one with, and no amount of
 * moving what is there produces one.
 *
 * A profile swept along one axis, rather than a general mesh builder, because
 * that is what the missing parts of these products are. A jaw, a hinge plate, a
 * spine: all of them are a shape drawn from the side and run across the width,
 * and a side view is also the drawing a person would check it against.
 *
 * The measurement a new part is drawn from lives here too. A part that is added
 * has to be put where the parts already in the file are -- along this edge, as
 * wide as that one -- so where they are is the other half of the same job.
 */

/**
 * Every mesh's box in world space, by mesh name.
 *
 * `lo`, `hi`, `size` and `mid` in the scene's own units, and the `node` each
 * one came off so a caller can move what it measured. Read from the vertices
 * through the world matrix rather than from any box in the file, because a
 * bought file's boxes are as likely to be stale as its parts are to be in the
 * right place.
 */
export function worldBoxes(doc) {
  const found = new Map();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    const box = { hi: [-Infinity, -Infinity, -Infinity], lo: [Infinity, Infinity, Infinity], node };
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      for (let i = 0; i < pos.getCount(); i += 1) {
        const p = pos.getElement(i, [0, 0, 0]);
        const w = [p[0] * m[0] + p[1] * m[4] + p[2] * m[8] + m[12],
          p[0] * m[1] + p[1] * m[5] + p[2] * m[9] + m[13],
          p[0] * m[2] + p[1] * m[6] + p[2] * m[10] + m[14]];
        for (let q = 0; q < 3; q += 1) {
          if (w[q] < box.lo[q]) box.lo[q] = w[q];
          if (w[q] > box.hi[q]) box.hi[q] = w[q];
        }
      }
    }
    box.size = [0, 1, 2].map((q) => box.hi[q] - box.lo[q]);
    box.mid = [0, 1, 2].map((q) => (box.hi[q] + box.lo[q]) / 2);
    found.set(mesh.getName(), box);
  }
  return found;
}

/** Cross and normalise, for a face's normal. */
function faceNormal(a, b, c) {
  const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  const v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
  const len = Math.hypot(...n) || 1;
  return n.map((q) => q / len);
}

/**
 * Sweep a closed profile across z, and hand back the node it lives on.
 *
 * `profile` is a list of `[x, y]` in order around the shape, and it has to be
 * convex: the two ends are closed with a triangle fan from the first point,
 * which is the cheapest thing that is correct for the shapes this is for and
 * silently wrong for anything else.
 *
 * Wound counter-clockwise in the profile's own plane, with `z0` behind `z1`.
 * The other way round builds the same solid inside out, which with back faces
 * culled renders as a hole in the shape of the part -- so the winding is
 * asserted in the tests rather than left to the caller to notice.
 *
 * Flat-shaded on purpose, one normal per face and no shared vertices. These
 * parts are pressed or folded metal whose edges are meant to read as edges, and
 * a smoothed cube looks like a bar of soap.
 */
export function sweepProfile(doc, { material, name, profile, z0, z1 }) {
  const points = [];
  const normals = [];
  const push = (tri) => {
    const n = faceNormal(...tri);
    for (const p of tri) { points.push(...p); normals.push(...n); }
  };

  const at = (i, z) => [profile[i][0], profile[i][1], z];
  const count = profile.length;

  // The wall under each edge of the profile, as two triangles.
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    push([at(i, z0), at(j, z0), at(j, z1)]);
    push([at(i, z0), at(j, z1), at(i, z1)]);
  }
  // The two ends, wound opposite ways so both face outwards.
  for (let i = 1; i + 1 < count; i += 1) {
    push([at(0, z1), at(i, z1), at(i + 1, z1)]);
    push([at(0, z0), at(i + 1, z0), at(i, z0)]);
  }

  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer();
  const prim = doc.createPrimitive()
    .setMaterial(material)
    .setAttribute("POSITION", doc.createAccessor()
      .setType("VEC3").setArray(new Float32Array(points)).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor()
      .setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer));

  const node = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
  doc.getRoot().listScenes()[0]?.addChild(node);
  return node;
}
