"""Headless Blender batch-converter: Mixamo animation FBX -> GLB with engine names.

Run: blender --background --python scripts/convert_anims.py
Imports each Mixamo FBX (armature + animation, "Without Skin"), exports a .glb
named for the locomotion state the game expects (idle/walk/run/interact).
"""
import bpy
import os

ANIM_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "assets", "characters", "animations",
)

# Mixamo file (as downloaded) -> engine clip name
MAPPING = {
    "Breathing Idle.fbx": "idle",
    "Walking.fbx": "walk",
    "Running.fbx": "run",
    "Talking.fbx": "interact",
}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    # purge orphan data so animations don't leak between files
    for block in (bpy.data.armatures, bpy.data.meshes, bpy.data.actions, bpy.data.objects):
        for item in list(block):
            try:
                block.remove(item)
            except Exception:
                pass


def convert(fbx_name, clip_name):
    src = os.path.join(ANIM_DIR, fbx_name)
    if not os.path.exists(src):
        print(f"[convert] MISSING: {src}")
        return False
    clear_scene()
    bpy.ops.import_scene.fbx(filepath=src)
    out = os.path.join(ANIM_DIR, clip_name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=False,
        export_animations=True,
        export_skins=True,
        export_yup=True,
    )
    print(f"[convert] {fbx_name} -> {clip_name}.glb")
    return True


def main():
    print(f"[convert] anim dir: {ANIM_DIR}")
    ok = 0
    for fbx_name, clip_name in MAPPING.items():
        if convert(fbx_name, clip_name):
            ok += 1
    print(f"[convert] done: {ok}/{len(MAPPING)} clips converted")


main()
