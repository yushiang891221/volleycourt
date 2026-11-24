# VRoid（VRM 0.x）裁成「只有臉＋頭髮」的小檔：身體、衣服、骨架都刪掉，保留臉的表情（shape keys），貼圖縮成 512、WEBP。
# 用法（低優先權、4 核）：blender --background --factory-startup -t 4 --python trim_head.py -- 輸入.vrm 輸出.glb
import bpy, bmesh, sys, os

args = sys.argv[sys.argv.index("--") + 1:]
SRC, DST = args[0], args[1]
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
tmp = os.path.join(os.path.dirname(DST), "_tmp_in.glb")
import shutil; shutil.copyfile(SRC, tmp)          # VRM 就是 glTF，改副檔名讀
bpy.ops.import_scene.gltf(filepath=tmp)
os.remove(tmp)

keep = []
for o in list(bpy.data.objects):
    if o.type != "MESH":
        continue
    mats = [m.name if m else "" for m in o.data.materials]
    print("MESH", o.name, mats)
    is_face = o.name.lower().startswith("face")
    is_hair = o.name.lower().startswith("hair")
    if not (is_face or is_hair):
        # 身體網格裡的 HairBack（貼頭的後髮）也要留
        hair_slots = [i for i, n in enumerate(mats) if "HAIR" in n.upper()]
        if not hair_slots:
            continue
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index not in hair_slots], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(o.data); bm.free()
        if o.data.shape_keys:
            o.shape_key_clear()
        is_hair = True
    # 拿掉骨架：網格本來就是站姿（rest），直接留頂點位置
    for m in list(o.modifiers):
        o.modifiers.remove(m)
    o.vertex_groups.clear()
    o.name = "Facebaked" if is_face else "Hair_" + o.name
    keep.append(o)

for o in list(bpy.data.objects):
    if o not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
for o in keep:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# 沒用到的材質、圖片清掉；圖片縮成 512
for o in keep:
    used = {p.material_index for p in o.data.polygons}
    for i, m in enumerate(o.data.materials):
        if i not in used:
            continue
for img in bpy.data.images:
    if img.users and img.size[0] > 512:
        img.scale(512, 512)
bpy.ops.object.select_all(action="DESELECT")
for o in keep:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=DST, use_selection=True, export_format="GLB", export_skins=False,
                          export_morph=True, export_image_format="WEBP", export_apply=False)
print("TRIMMED", DST, os.path.getsize(DST), [o.name for o in keep])
