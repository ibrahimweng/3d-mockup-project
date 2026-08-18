# Environment maps

All four are CC0 (public domain) from [Poly Haven](https://polyhaven.com), at 1K
resolution. They are bundled rather than fetched at runtime so the app has no
network dependency and no third-party service in the request path.

| File | Poly Haven asset |
| --- | --- |
| `studio-soft.hdr` | studio_small_09 |
| `hard-key.hdr` | photo_studio_01 |
| `dark-rim.hdr` | brown_photostudio_02 |
| `daylight.hdr` | kloofendal_43d_clear |

1K is deliberate. The environment is read as a blurred reflection across a curved
surface, so its resolution limits the sharpness of reflected highlights rather
than the render itself — 2K quadruples the download for detail that a roughness
of 0.2 immediately scatters. A mirror-finish flat panel is the one case that
would benefit, and it is not what these scenes are for.

CC0 carries no attribution requirement. This file exists so the provenance stays
traceable, not because it is owed.
