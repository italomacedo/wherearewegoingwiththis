"""Batch-convert Quaternius pack source files (FBX or glTF) -> GLB for the game.

Run:
  blender --background --python scripts/convert_assets.py -- <srcDir> <outDir> [--fbx|--gltf] [--no-anim] [--names a,b,c]

- <srcDir> is searched recursively for *.fbx (default) or *.gltf/*.glb (--gltf).
- Each file is imported into a cleared scene, LIGHT/CAMERA objects stripped, and
  exported as a single GLB (textures embedded) into <outDir>/<snake_case>.glb.
- --no-anim drops animations (static props/buildings/ships need no rig/clips).
- --names limits conversion to a comma-separated list of basenames (no extension),
  matched case-insensitively — used to curate a subset of a big pack.

Mirrors scripts/convert_outfits.py (scene clear + disable cycles + strip lights).
"""
import bpy, os, sys, addon_utils, glob

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
EXT = "gltf" if "--gltf" in argv else "fbx"
ANIM = "--no-anim" not in argv
NAMES = None
if "--names" in argv:
    NAMES = {n.strip().lower() for n in argv[argv.index("--names") + 1].split(",") if n.strip()}

try:
    addon_utils.disable("cycles")
except Exception as e:
    print(f"[assets] cycles: {e}")

os.makedirs(OUT, exist_ok=True)


def key_of(path):
    name = os.path.splitext(os.path.basename(path))[0]
    return name.lower().replace("-", "_").replace(" ", "_")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for blk in (bpy.data.armatures, bpy.data.meshes, bpy.data.actions,
                bpy.data.objects, bpy.data.materials, bpy.data.images):
        for it in list(blk):
            try:
                blk.remove(it)
            except Exception:
                pass


def fix_materials():
    """Some FBX imports bring base-color ALPHA in as 0 -> fully transparent in
    glTF (invisible). Force every material opaque with alpha 1."""
    for mat in bpy.data.materials:
        try:
            mat.blend_method = "OPAQUE"
        except Exception:
            pass
        try:
            dc = mat.diffuse_color
            mat.diffuse_color = (dc[0], dc[1], dc[2], 1.0)
        except Exception:
            pass
        if getattr(mat, "use_nodes", False) and mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    bc = node.inputs.get("Base Color")
                    if bc and hasattr(bc, "default_value") and len(bc.default_value) == 4:
                        v = bc.default_value
                        bc.default_value = (v[0], v[1], v[2], 1.0)
                    al = node.inputs.get("Alpha")
                    if al and hasattr(al, "default_value"):
                        al.default_value = 1.0


def convert(src):
    out = os.path.join(OUT, key_of(src) + ".glb")
    clear_scene()
    if EXT == "gltf":
        bpy.ops.import_scene.gltf(filepath=src)
    else:
        bpy.ops.import_scene.fbx(filepath=src)
    for obj in list(bpy.data.objects):
        if obj.type in {"LIGHT", "CAMERA"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    fix_materials()
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", use_selection=False,
        export_animations=ANIM, export_skins=ANIM, export_yup=True,
    )
    print(f"[assets] {os.path.basename(src)} -> {os.path.basename(out)}")


patterns = ["*.gltf", "*.glb"] if EXT == "gltf" else ["*.fbx"]
srcs = []
for pat in patterns:
    srcs += glob.glob(os.path.join(SRC, "**", pat), recursive=True)
srcs = sorted(set(srcs))
if NAMES is not None:
    srcs = [s for s in srcs if os.path.splitext(os.path.basename(s))[0].lower() in NAMES]

done = 0
for s in srcs:
    try:
        convert(s)
        done += 1
    except Exception as e:
        print(f"[assets] FAILED {os.path.basename(s)}: {e}")
print(f"[assets] done: {done}/{len(srcs)}")
