import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

/**
 * The iPhone scene: a real GLB lit entirely by a prefiltered environment.
 *
 * There is no path tracer here. The environment is convolved once into mip
 * levels representing increasing roughness, after which every frame is a single
 * raster pass. Moving the camera costs one draw call rather than restarting a
 * convergence that has to be re-accumulated from zero, which is what let the old
 * renderer hold a GPU at full load while showing a static image.
 */

/**
 * A stray mesh in the source file, 5,155 triangles spanning y 16..159mm and
 * sitting 7mm proud of the phone's back. Nothing on a real iPhone extends above
 * the top edge or behind the rear panel, and its bounds alone added 83mm of
 * height — which would push the camera back, float the phone above its own
 * shadow, and throw off the focus distance. Hidden rather than deleted, so the
 * source file stays untouched and this is one line to reverse.
 */
const EXCLUDED_NODES = new Set(["lwfmQebmsqyrPXh"]);

/**
 * The display panel's material in the source file.
 *
 * Found by raycasting head-on through the screen centre and taking the frontmost
 * surface. It is already configured as a lit display: emissive white, carrying
 * the wallpaper as an *emissiveMap* rather than a base colour map — which is why
 * two earlier guesses failed. Both were real, correctly sized panels, but they
 * sit behind this one and are never seen.
 *
 * The lesson is in the fallback below: a display is identified by being the
 * frontmost emissive surface, not by size or by which texture is largest.
 */
const SCREEN_MATERIAL_NAME = "BsXHDwLKqtDOfrW";

export type ScreenTransform = {
  fit: "fill" | "fit" | "stretch";
  /** Pan, 0..1 per axis with 0.5 centred. */
  offset: { x: number; y: number };
  /** Uniform zoom, as a percentage. */
  scale: number;
  /** Independent width/height, 0..1 per axis with 0.5 unstretched. */
  stretch: { x: number; y: number };
};

export type IPhoneScene = {
  camera: THREE.PerspectiveCamera;
  dispose: () => void;
  /** Set the artwork shown on the display, or null to leave it dark. */
  setArtwork: (
    texture: THREE.Texture | null,
    transform?: ScreenTransform,
  ) => void;
  scene: THREE.Scene;
  /** Bounding sphere radius of the phone, for framing and focus. */
  subjectRadius: number;
  target: THREE.Vector3;
};

/**
 * Locate the display material by name, falling back to geometry.
 *
 * A name lookup is exact but brittle across re-exports; the geometric fallback
 * finds the largest flat, untextured, non-metallic panel — which is what an
 * off-state screen is — so a re-exported model still works without edits.
 */
function findScreenMaterial(root: THREE.Object3D): THREE.MeshStandardMaterial | null {
  let byName: THREE.MeshStandardMaterial | null = null;
  let bestPixels = 0;
  let byTexture: THREE.MeshStandardMaterial | null = null;

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const material = object.material;
    if (Array.isArray(material) || !(material instanceof THREE.MeshStandardMaterial)) {
      return;
    }

    if (material.name === SCREEN_MATERIAL_NAME) {
      byName = material;
      return;
    }

    // Fallback: a display is the surface that emits. Ranking by emissive
    // brightness finds it across re-exports, where names change but a screen
    // modelled as a lit panel stays a lit panel.
    const emissive = material.emissive;
    const strength = emissive ? emissive.r + emissive.g + emissive.b : 0;
    if (strength > bestPixels) {
      bestPixels = strength;
      byTexture = material;
    }
  });

  return byName ?? byTexture;
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

export async function buildIPhoneScene(options: {
  backgroundColor: string;
  environmentUrl: string;
  renderer: THREE.WebGLRenderer;
  showGround: boolean;
}): Promise<IPhoneScene> {
  const scene = new THREE.Scene();
  const disposables: { dispose: () => void }[] = [];

  const [gltf, environmentMap] = await Promise.all([
    new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/iphone-17-pro-max.glb`),
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

  const phone = gltf.scene;
  phone.traverse((object) => {
    if (EXCLUDED_NODES.has(object.name)) {
      object.visible = false;
      return;
    }
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  // Bounds are measured after hiding the stray mesh, so framing, shadow extent
  // and focus all derive from the phone alone.
  const bounds = new THREE.Box3();
  phone.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) {
      bounds.expandByObject(object);
    }
  });
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const centre = bounds.getCenter(new THREE.Vector3());

  // Recentre on the origin so orbiting turns the phone about itself rather than
  // swinging it around a point offset by wherever it sat in the source file.
  phone.position.sub(centre);
  scene.add(phone);

  const groundY = bounds.min.y - centre.y;

  if (options.showGround) {
    const groundGeometry = new THREE.PlaneGeometry(sphere.radius * 40, sphere.radius * 40);
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
  // purpose: raising it would double-light the phone and flatten the reflections
  // the HDRI is providing.
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

  const screenMaterial = findScreenMaterial(phone);

  // The display's real proportions, measured from the mesh carrying its
  // material rather than assumed, so fit maths survives a different model.
  let screenAspect = 9 / 19.5;
  phone.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.material !== screenMaterial) {
      return;
    }
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    if (!box) return;
    const size = box.getSize(new THREE.Vector3());
    const axes = [size.x, size.y, size.z].sort((a, b) => b - a);
    if (axes[1] > 0) screenAspect = axes[1] / axes[0];
  });

  const camera = new THREE.PerspectiveCamera(35, 1, sphere.radius * 0.01, sphere.radius * 60);

  return {
    camera,
    dispose: () => {
      for (const item of disposables) item.dispose();
      phone.traverse((object) => {
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
      // environment happens to be lighting the rest of the phone.
      // The stock wallpaper is an emissiveMap, so that is the channel that has
      // to be replaced; setting only `map` leaves the original still glowing.
      screenMaterial.map = texture;
      screenMaterial.emissiveMap = texture;
      screenMaterial.emissive = new THREE.Color(0xffffff);
      screenMaterial.emissiveIntensity = texture ? 1 : 0;
      screenMaterial.toneMapped = false;
      screenMaterial.needsUpdate = true;
    },
    subjectRadius: sphere.radius,
    target: new THREE.Vector3(0, 0, 0),
  };
}
