import {
  Scene, AbstractMesh, MeshBuilder, StandardMaterial,
  Color3, Vector3, Mesh,
} from '@babylonjs/core';
import { CharacterAppearance } from '@entities/CharacterData';
import { CharacterAssets } from '@assets/AssetManifest';

export interface AssembledCharacter {
  rootMesh: AbstractMesh;
  meshes: AbstractMesh[];
  dispose(): void;
}

/**
 * Assembles a character from GLTF parts (or procedural placeholders when
 * GLTF files are not yet available).
 *
 * Real GLTF loading is guarded by `canLoadGltf()` — in Node.js/Jest it falls
 * back to placeholder geometry so tests never touch the filesystem.
 */
export class CharacterAssembler {
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Returns true when SceneLoader is available (browser/Electron only) */
  static canLoadGltf(): boolean {
    return typeof document !== 'undefined';
  }

  async assemble(appearance: CharacterAppearance): Promise<AssembledCharacter> {
    if (CharacterAssembler.canLoadGltf()) {
      /* istanbul ignore next — GLTF loading is browser/Electron only */
      return this.assembleGltf(appearance);
    }
    return this.assemblePlaceholder(appearance);
  }

  /* istanbul ignore next */
  private async assembleGltf(appearance: CharacterAppearance): Promise<AssembledCharacter> {
    const { SceneLoader } = await import('@babylonjs/core');
    const meshes: AbstractMesh[] = [];

    // Load base body
    const basePath = CharacterAssets.bases[appearance.bodyBase as keyof typeof CharacterAssets.bases]
      ?? CharacterAssets.bases.body_female_black;

    try {
      const result = await SceneLoader.ImportMeshAsync('', '/assets/', basePath, this.scene);
      meshes.push(...result.meshes);
    } catch {
      // GLTF file not found — fall back to placeholder for this part
      const placeholderBody = this.buildPlaceholderBody();
      this.applySkinTone(placeholderBody, appearance.skinTone);
      meshes.push(...placeholderBody);
    }

    // Apply skin tone to body meshes
    this.applySkinTone(meshes, appearance.skinTone);

    const root = meshes[0] ?? MeshBuilder.CreateBox('char-root', { size: 0.01 }, this.scene);

    return {
      rootMesh: root,
      meshes,
      dispose: () => meshes.forEach((m) => m.dispose()),
    };
  }

  /** Procedural placeholder — used when GLTF files don't exist yet */
  assemblePlaceholder(appearance: CharacterAppearance): AssembledCharacter {
    const meshes: AbstractMesh[] = [];

    // Body parts (built with neutral color, then skin tone applied separately)
    const bodyMeshes = this.buildPlaceholderBody();
    this.applySkinTone(bodyMeshes, appearance.skinTone);
    meshes.push(...bodyMeshes);

    // Hair
    if (appearance.hair) {
      meshes.push(this.buildPlaceholderHair(appearance.hairColor));
    }

    // Clothing tints
    if (appearance.top) {
      meshes.push(this.buildPlaceholderClothingPart('top', '#223344'));
    }
    if (appearance.bottom) {
      meshes.push(this.buildPlaceholderClothingPart('bottom', '#1A2A3A'));
    }
    if (appearance.shoes) {
      meshes.push(this.buildPlaceholderClothingPart('shoes', '#111111'));
    }

    const root = meshes[0]!;
    return {
      rootMesh: root,
      meshes,
      dispose: () => meshes.forEach((m) => m.dispose()),
    };
  }

  private buildPlaceholderBody(): Mesh[] {
    const meshes: Mesh[] = [];

    const mat = new StandardMaterial('skin-mat', this.scene);
    mat.diffuseColor = new Color3(0.8, 0.7, 0.6); // neutral — overridden by applySkinTone

    // Head
    const head = MeshBuilder.CreateSphere('head', { diameter: 0.25 }, this.scene);
    head.position = new Vector3(0, 1.7, 0);
    head.material = mat;
    meshes.push(head);

    // Torso
    const torso = MeshBuilder.CreateCylinder('torso', { height: 0.6, diameter: 0.35 }, this.scene);
    torso.position = new Vector3(0, 1.2, 0);
    torso.material = mat;
    meshes.push(torso);

    // Arms
    ['arm_l', 'arm_r'].forEach((name, i) => {
      const arm = MeshBuilder.CreateCylinder(name, { height: 0.55, diameter: 0.1 }, this.scene);
      arm.position = new Vector3(i === 0 ? -0.25 : 0.25, 1.2, 0);
      arm.material = mat;
      meshes.push(arm);
    });

    // Legs
    ['leg_l', 'leg_r'].forEach((name, i) => {
      const leg = MeshBuilder.CreateCylinder(name, { height: 0.7, diameter: 0.12 }, this.scene);
      leg.position = new Vector3(i === 0 ? -0.1 : 0.1, 0.65, 0);
      leg.material = mat;
      meshes.push(leg);
    });

    return meshes;
  }

  private buildPlaceholderHair(hairColor: string): Mesh {
    const mat = new StandardMaterial('hair-mat', this.scene);
    mat.diffuseColor = Color3.FromHexString(hairColor.padEnd(7, '0'));

    const hair = MeshBuilder.CreateSphere('hair', { diameter: 0.27 }, this.scene);
    hair.position = new Vector3(0, 1.82, 0);
    hair.scaling.y = 0.7;
    hair.material = mat;
    return hair;
  }

  private buildPlaceholderClothingPart(name: string, color: string): Mesh {
    const mat = new StandardMaterial(`${name}-mat`, this.scene);
    mat.diffuseColor = Color3.FromHexString(color);

    const heights: Record<string, number> = { top: 0.6, bottom: 0.7, shoes: 0.15 };
    const yPositions: Record<string, number> = { top: 1.2, bottom: 0.65, shoes: 0.3 };

    const mesh = MeshBuilder.CreateCylinder(name, {
      height: heights[name] !== undefined ? heights[name]! : 0.4,
      diameter: 0.38,
    }, this.scene);
    mesh.position.y = yPositions[name] !== undefined ? yPositions[name]! : 1;
    mesh.material = mat;
    return mesh;
  }

  private applySkinTone(meshes: AbstractMesh[], skinTone: string): void {
    meshes.forEach((m) => {
      if (m.material instanceof StandardMaterial) {
        (m.material as StandardMaterial).diffuseColor = Color3.FromHexString(
          skinTone.padEnd(7, '0')
        );
      }
    });
  }
}
