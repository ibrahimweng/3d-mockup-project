import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

import { applyModelTextureAnisotropy } from "./render/device-assets";

function modelWith(material: THREE.Material): GLTF {
  const scene = new THREE.Scene();

  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  return { scenes: [scene] } as unknown as GLTF;
}

describe("model texture anisotropy", () => {
  it("raises every map a device brings with it", () => {
    const material = new THREE.MeshStandardMaterial({
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
      roughnessMap: new THREE.Texture(),
    });

    applyModelTextureAnisotropy(modelWith(material), 16);

    expect(material.map?.anisotropy).toBe(16);
    expect(material.normalMap?.anisotropy).toBe(16);
    expect(material.roughnessMap?.anisotropy).toBe(16);
    // `needsUpdate` is write-only on a three.js texture; the upload it asks
    // for is observable as the version it bumps.
    expect(material.map?.version).toBeGreaterThan(0);
  });

  it("reaches every material on a mesh that has several", () => {
    const first = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const second = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const scene = new THREE.Scene();

    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [first, second]));
    applyModelTextureAnisotropy({ scenes: [scene] } as unknown as GLTF, 8);

    expect(first.map?.anisotropy).toBe(8);
    expect(second.map?.anisotropy).toBe(8);
  });

  it("asks once, however many scenes are built from the same model", () => {
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const gltf = modelWith(material);

    applyModelTextureAnisotropy(gltf, 16);
    const versionAfterFirst = material.map!.version;
    // A second scene from the same parsed model must not walk it again.
    applyModelTextureAnisotropy(gltf, 16);

    expect(material.map?.version).toBe(versionAfterFirst);
    expect(material.map?.anisotropy).toBe(16);
  });

  it("leaves a context that cannot filter anisotropically alone", () => {
    const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });

    applyModelTextureAnisotropy(modelWith(material), 1);

    expect(material.map?.anisotropy).toBe(1);
    expect(material.map?.version).toBe(0);
  });

  it("does not lower a texture that already asks for more", () => {
    const texture = new THREE.Texture();

    texture.anisotropy = 16;
    const material = new THREE.MeshStandardMaterial({ map: texture });

    applyModelTextureAnisotropy(modelWith(material), 4);

    expect(texture.anisotropy).toBe(16);
    expect(texture.version).toBe(0);
  });
});
