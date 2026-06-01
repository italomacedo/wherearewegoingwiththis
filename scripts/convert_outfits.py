"""Convert Quaternius Ultimate Modular 'Individual Characters' glTF -> GLB.

Run: blender --background --python scripts/convert_outfits.py -- <srcDir> <outDir>
Each character glTF carries its 4 parts + embedded animations on one rig.
"""
import bpy, os, sys, addon_utils, glob

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]

try:
    addon_utils.disable("cycles")
except Exception as e:
    print(f"[outfits] cycles: {e}")

os.makedirs(OUT, exist_ok=True)


def key_of(path):
    name = os.path.splitext(os.path.basename(path))[0]
    return name.lower().replace("-", "_")


def convert(src):
    out = os.path.join(OUT, key_of(src) + ".glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for blk in (bpy.data.armatures, bpy.data.meshes, bpy.data.actions, bpy.data.objects, bpy.data.materials):
        for it in list(blk):
            try: blk.remove(it)
            except Exception: pass
    bpy.ops.import_scene.gltf(filepath=src)
    for obj in list(bpy.data.objects):
        if obj.type in {"LIGHT", "CAMERA"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False,
                              export_animations=True, export_skins=True, export_yup=True)
    print(f"[outfits] {os.path.basename(src)} -> {os.path.basename(out)}")


srcs = sorted(glob.glob(os.path.join(SRC, "*.gltf")))
for s in srcs:
    convert(s)
print(f"[outfits] done: {len(srcs)}")
