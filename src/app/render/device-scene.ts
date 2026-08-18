import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

import type { DeviceDefinition } from "../product-domain";

/**
 * A device scene: a real GLB lit entirely by a prefiltered environment.
 *
 * There is no path tracer here. The environment is convolved once into mip
 * levels representing increasing roughness, after which every frame is a single
 * raster pass. Moving the camera costs one draw call rather than restarting a
 * convergence that has to be re-accumulated from zero, which is what would let a
 * progressive renderer hold a GPU at full load while showing a static image.
 *
 * Everything that differs between the five devices is data on `DeviceDefinition`
 * rather than a branch here, so adding a sixth model is a catalog entry.
 */

export type ScreenTransform = {
  fit: "fill" | "fit" | "stretch";
  /** Pan, 0..1 per axis with 0.5 centred. */
  offset: { x: number; y: number };
  /** Uniform zoom, as a percentage. */
  scale: number;
  /** Independent width/height, 0..1 per axis with 0.5 unstretched. */
  stretch: { x: number; y: number };
};

export type DeviceScene = {
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  /** The device geometry, so a hit test can ignore the ground. */
  subject: THREE.Object3D;
  /** Set the artwork shown on the display, or null to leave it dark. */
  setArtwork: (
    texture: THREE.Texture | null,
    transform?: ScreenTransform,
  ) => void;
  scene: THREE.Scene;
  /** Bounding sphere radius of the device, for framing. */
  subjectRadius: number;
  target: THREE.Vector3;
};

/**
 * Locate the display material by name, falling back to emission.
 *
 * A name lookup is exact but brittle across re-exports; ranking by emissive
 * strength finds the display anywhere, because a screen modelled as a lit panel
 * stays a lit panel even when its material is renamed. Ranking by size or by
 * largest texture does not work: on these phones two correctly-sized unlit
 * panels sit behind the real display and are never seen.
 */
function findScreenMaterial(
  root: THREE.Object3D,
  materialName: string,
): THREE.MeshStandardMaterial | null {
  let byName: THREE.MeshStandardMaterial | null = null;
  let byEmission: THREE.MeshStandardMaterial | null = null;
  let strongest = 0;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (
      Array.isArray(material) ||
      !(material instanceof THREE.MeshStandardMaterial)
    ) {
      return;
    }

    if (material.name === materialName) {
      byName = material;
      return;
    }

    const emissive = material.emissive;
    const strength = emissive ? emissive.r + emissive.g + emissive.b : 0;
    if (strength > strongest) {
      strongest = strength;
      byEmission = material;
    }
  });

  return byName ?? byEmission;
}

/**
 * Measure the display's proportions from the mesh carrying its material.
 *
 * Taking the two largest axes of the local bounding box is correct for a flat
 * panel. A screen modelled at a tilt has depth in all three axes and reports a
 * height that is too small, which is why the catalog can override this.
 */
function measureScreenAspect(
  root: THREE.Object3D,
  screenMaterial: THREE.MeshStandardMaterial | null,
  fallback: number,
): number {
  let aspect = fallback;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.material !== screenMaterial) {
      return;
    }
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (!box) return;
    const size = box.getSize(new THREE.Vector3());
    const axes = [size.x, size.y, size.z].sort((a, b) => b - a);
    if (axes[0] > 0 && axes[1] > 0) aspect = axes[1] / axes[0];
  });
  return aspect;
}

/**
 * Map the screen controls onto a texture's repeat/offset.
 *
 * `repeat` below 1 zooms *in*, because it is how much of the texture spans the
 * surface rather than how large the image is drawn — so every factor here is
 * inverted relative to how the control reads.
 */
function applyScreenTransform(
  texture: THREE.Texture,
  screenAspect: number,
  transform: ScreenTransform | undefined,
): void {
  // Sampling outside 0..1 must clamp, not tile: a zoomed-in screenshot would
  // otherwise repeat itself around the edges of the display.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // Scale and stretch operate about the middle of the image rather than its
  // corner, so zooming keeps the subject centred instead of drifting.
  texture.center.set(0.5, 0.5);

  if (!transform) {
    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);
    texture.needsUpdate = true;
    return;
  }

  const image = texture.image as { height?: number; width?: number } | undefined;
  const imageAspect =
    image?.width && image?.height ? image.width / image.height : screenAspect;

  // Base fit. `fill` covers and crops, `fit` shows everything and leaves
  // margins, `stretch` ignores aspect entirely and distorts to the display.
  let repeatX = 1;
  let repeatY = 1;
  if (transform.fit !== "stretch") {
    const ratio = imageAspect / screenAspect;
    const cover = transform.fit === "fill";
    if (ratio > 1 === cover) repeatX = cover ? 1 / ratio : ratio;
    else repeatY = cover ? ratio : 1 / ratio;
  }

  // Manual zoom on top of the fit.
  const zoom = Math.max(0.05, transform.scale / 100);
  repeatX /= zoom;
  repeatY /= zoom;

  // Stretch maps 0..1 onto a half-to-double factor per axis, so the pad's
  // centre leaves the image untouched.
  const stretchX = 0.5 + Math.max(0, Math.min(1, transform.stretch.x)) * 1.5;
  const stretchY = 0.5 + Math.max(0, Math.min(1, transform.stretch.y)) * 1.5;
  repeatX /= stretchX;
  repeatY /= stretchY;

  texture.repeat.set(repeatX, repeatY);

  // Pan across whatever is being cropped. With nothing cropped there is no
  // slack on that axis and the offset correctly does nothing.
  const slackX = Math.max(0, 1 - repeatX);
  const slackY = Math.max(0, 1 - repeatY);
  texture.offset.set(
    (Math.max(0, Math.min(1, transform.offset.x)) - 0.5) * slackX,
    (Math.max(0, Math.min(1, transform.offset.y)) - 0.5) * slackY,
  );

  texture.needsUpdate = true;
}

export async function buildDeviceScene(options: {
  backgroundColor: string;
  device: DeviceDefinition;
  environmentUrl: string;
  renderer: THREE.WebGLRenderer;
  showGround: boolean;
}): Promise<DeviceScene> {
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];

  const [gltf, environmentMap] = await Promise.all([
    new GLTFLoader().loadAsync(
      `${import.meta.env.BASE_URL}models/${options.device.modelFile}`,
    ),
    new RGBELoader().loadAsync(options.environmentUrl),
  ]);

  // Convolve the environment once. This is the whole lighting model: every
  // material samples the mip level matching its roughness, so a polished rail
  // and a matte back read correctly from a single texture with no lights.
  const pmrem = new THREE.PMREMGenerator(options.renderer);
  pmrem.compileEquirectangularShader();
  const environment = pmrem.fromEquirectangular(environmentMap).texture;
  environmentMap.dispose();
  pmrem.dispose();
  scene.environment = environment;
  disposables.push(environment);

  // Several of these files hold more than one device in sibling scenes, and the
  // default scene is not always the one named on the tin — loading `gltf.scene`
  // from `macbook.glb` would render a phone.
  const subject = options.device.sceneName
    ? (gltf.scenes.find((entry) => entry.name === options.device.sceneName) ??
      gltf.scene)
    : gltf.scene;

  if (options.device.yawDegrees) {
    subject.rotation.y = THREE.MathUtils.degToRad(options.device.yawDegrees);
    subject.updateMatrixWorld(true);
  }

  const excluded = new Set(options.device.excludedNodes);
  subject.traverse((object) => {
    if (excluded.has(object.name)) {
      object.visible = false;
      return;
    }
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  // Bounds are measured after hiding stray meshes, so framing and shadow extent
  // derive from the device alone.
  const bounds = new THREE.Box3();
  subject.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) {
      bounds.expandByObject(object);
    }
  });
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const centre = bounds.getCenter(new THREE.Vector3());

  // Recentre on the origin so orbiting turns the device about itself rather
  // than swinging it around wherever it sat in the source file.
  subject.position.sub(centre);
  scene.add(subject);

  const groundY = bounds.min.y - centre.y;

  if (options.showGround) {
    const groundGeometry = new THREE.PlaneGeometry(
      sphere.radius * 40,
      sphere.radius * 40,
    );
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(options.backgroundColor),
      roughness: 0.92,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = groundY - sphere.radius * 0.002;
    ground.receiveShadow = true;
    scene.add(ground);
    disposables.push(groundGeometry, groundMaterial);
  }

  // One directional light, present only to cast the contact shadow — the
  // environment already supplies all the illumination. Its intensity is low on
  // purpose: raising it would double-light the device and flatten the
  // reflections the HDRI is providing. Every extent is expressed in subject
  // radii so the same setup works for a watch and for a laptop.
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(sphere.radius * 2, sphere.radius * 4, sphere.radius * 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0006;
  const extent = sphere.radius * 2.2;
  key.shadow.camera.left = -extent;
  key.shadow.camera.right = extent;
  key.shadow.camera.top = extent;
  key.shadow.camera.bottom = -extent;
  key.shadow.camera.near = sphere.radius * 0.2;
  key.shadow.camera.far = sphere.radius * 12;
  scene.add(key);

  const screenMaterial = findScreenMaterial(
    subject,
    options.device.screenMaterial,
  );
  const screenAspect =
    options.device.screenAspect ??
    measureScreenAspect(subject, screenMaterial, 9 / 19.5);

  const camera = new THREE.PerspectiveCamera(
    35,
    1,
    sphere.radius * 0.01,
    sphere.radius * 60,
  );

  return {
    camera,
    dispose: () => {
      for (const item of disposables) item.dispose();
      subject.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      });
    },
    scene,
    setArtwork: (texture, transform) => {
      if (!screenMaterial) return;
      if (texture) applyScreenTransform(texture, screenAspect, transform);
      // A display emits rather than reflects. Assigning the artwork as an
      // emissive map keeps it readable at full brightness regardless of how the
      // environment happens to be lighting the rest of the device. The stock
      // wallpaper on these models is an emissiveMap, so that is the channel
      // that has to be replaced; setting only `map` leaves the original glowing.
      screenMaterial.map = texture;
      screenMaterial.emissiveMap = texture;
      screenMaterial.emissive = new THREE.Color(0xffffff);
      screenMaterial.emissiveIntensity = texture ? 1 : 0;
      screenMaterial.toneMapped = false;
      screenMaterial.needsUpdate = true;
    },
    subject,
    subjectRadius: sphere.radius,
    target: new THREE.Vector3(0, 0, 0),
  };
}
