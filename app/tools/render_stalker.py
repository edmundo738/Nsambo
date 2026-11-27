# render_stalker.py — renders headless (Cycles CPU) do stalker para auditoria visual
# uso:
#   LD_LIBRARY_PATH=/tmp/stublibs python3 tools/render_stalker.py --views /tmp/out
#   LD_LIBRARY_PATH=/tmp/stublibs python3 tools/render_stalker.py --poses /tmp/poses /tmp/out
#   LD_LIBRARY_PATH=/tmp/stublibs python3 tools/render_stalker.py --hero /tmp/out
#   LD_LIBRARY_PATH=/tmp/stublibs python3 tools/render_stalker.py --video /tmp/track /tmp/frames
import sys, json, math
from pathlib import Path
import bpy

ASSETS = Path('/home/user/Nsambo/assets')
TEX = ASSETS / 'textures' / 'stalker'
GLB = ASSETS / 'models' / 'stalker.glb'

# ─────────────────────────── cena ───────────────────────────
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def world_dark(strength=0.16, color=(0.11, 0.115, 0.13)):
    w = bpy.data.worlds.new('world')
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*color, 1.0)
    bg.inputs[1].default_value = strength

def make_material():
    m = bpy.data.materials.new('stalker_pbr')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    p.location = (600, 0)
    out.location = (900, 0)
    tex_a = nt.nodes.new('ShaderNodeTexImage'); tex_a.image = bpy.data.images.load(str(TEX / 'skin.jpg')); tex_a.image.colorspace_settings.name = 'sRGB'; tex_a.location = (-800, 300)
    tex_ao = nt.nodes.new('ShaderNodeTexImage'); tex_ao.image = bpy.data.images.load(str(TEX / 'skin.ao.jpg')); tex_ao.image.colorspace_settings.name = 'Non-Color'; tex_ao.location = (-800, 0)
    tex_r = nt.nodes.new('ShaderNodeTexImage'); tex_r.image = bpy.data.images.load(str(TEX / 'skin.roughness.jpg')); tex_r.image.colorspace_settings.name = 'Non-Color'; tex_r.location = (-800, -250)
    tex_n = nt.nodes.new('ShaderNodeTexImage'); tex_n.image = bpy.data.images.load(str(TEX / 'skin.normal.jpg')); tex_n.image.colorspace_settings.name = 'Non-Color'; tex_n.location = (-800, -550)
    tex_e = nt.nodes.new('ShaderNodeTexImage'); tex_e.image = bpy.data.images.load(str(TEX / 'stalker.emissive.jpg')); tex_e.image.colorspace_settings.name = 'sRGB'; tex_e.location = (-800, -850)
    mixao = nt.nodes.new('ShaderNodeMix'); mixao.data_type = 'RGBA'; mixao.blend_type = 'MULTIPLY'; mixao.inputs['Factor'].default_value = 0.88; mixao.location = (-350, 250)
    nmap = nt.nodes.new('ShaderNodeNormalMap'); nmap.inputs['Strength'].default_value = 0.85; nmap.location = (-350, -550)
    nt.links.new(tex_a.outputs['Color'], mixao.inputs[6])
    nt.links.new(tex_ao.outputs['Color'], mixao.inputs[7])
    nt.links.new(mixao.outputs[2], p.inputs['Base Color'])
    nt.links.new(tex_r.outputs['Color'], p.inputs['Roughness'])
    nt.links.new(tex_n.outputs['Color'], nmap.inputs['Color'])
    nt.links.new(nmap.outputs['Normal'], p.inputs['Normal'])
    nt.links.new(tex_e.outputs['Color'], p.inputs['Emission Color'])
    p.inputs['Emission Strength'].default_value = 2.4
    p.inputs['Specular IOR Level'].default_value = 0.28
    p.inputs['IOR'].default_value = 1.45
    nt.links.new(p.outputs['BSDF'], out.inputs['Surface'])
    return m

def add_ground():
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=32, location=(0, 0, -1.005), fill_type='NGON')
    g = bpy.context.active_object
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    bsdf = gm.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.14, 0.125, 0.112, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.62
    bsdf.inputs['Specular IOR Level'].default_value = 0.08
    g.data.materials.append(gm)
    return g

def add_lamp_spot(name, loc, energy, color, angle_deg=48):
    bpy.ops.object.light_add(type='SPOT', location=loc)
    lamp = bpy.context.active_object
    lamp.name = name
    lamp.data.energy = energy
    lamp.data.color = color
    lamp.data.spot_size = math.radians(angle_deg)
    lamp.data.spot_blend = 0.55
    lamp.data.shadow_soft_size = 0.35
    return lamp

def add_lamp_area(name, loc, energy, color, size=1.6):
    bpy.ops.object.light_add(type='AREA', location=loc)
    lamp = bpy.context.active_object
    lamp.name = name
    lamp.data.energy = energy
    lamp.data.color = color
    lamp.data.size = size
    lamp.data.shape = 'RECTANGLE'
    lamp.data.size_y = size * 0.7
    return lamp

def setup_lights_and_ground():
    add_ground()
    key = add_lamp_spot('key_spot', (2.3, -2.6, 3.1), 900, (1.0, 0.83, 0.55), 62)
    tgt = bpy.data.objects.new('tgt', None); bpy.context.collection.objects.link(tgt)
    tgt.location = (0, 0, -0.25)
    for lamp in [key]:
        c = lamp.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    down = add_lamp_spot('down_spot', (0.4, -0.6, 4.4), 620, (0.95, 0.88, 0.78), 70)
    c = down.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    rim = add_lamp_area('rim_area', (-1.6, 2.4, 1.6), 260, (0.62, 0.74, 1.0), 2.2)
    c = rim.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    fill = add_lamp_area('fill_area', (-2.4, -2.2, 0.6), 95, (0.9, 0.75, 0.6), 3.0)
    c = fill.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    face = add_lamp_area('face_area', (0.3, -3.4, 1.35), 90, (0.82, 0.80, 0.78), 2.4)
    c = face.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    bpy.context.scene.view_settings.view_transform = 'AgX'
    bpy.context.scene.view_settings.look = 'AgX - Medium High Contrast'
    bpy.context.scene.view_settings.exposure = 0.2

def setup_cycles(samples, res_x, res_y, denoise=True):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = denoise
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = 6
    sc.cycles.diffuse_bounces = 3
    sc.cycles.filter_width = 1.0
    sc.render.resolution_x = res_x
    sc.render.resolution_y = res_y
    sc.render.image_settings.file_format = 'PNG'
    sc.render.film_transparent = False

def import_stalker():
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    return bpy.data.objects['stalker']

def assign_material(obj, mat):
    if obj.type != 'MESH':
        return
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True

# ─────────────────────────── modos ───────────────────────────
def cmd_stills(out_dir):
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    reset_scene(); world_dark()
    mat = make_material()
    st = import_stalker(); assign_material(st, mat)
    setup_lights_and_ground(); setup_cycles(96, 880, 880)
    sc = bpy.context.scene
    # stalker encara -Y; a criatura vira-se para -Y, a sua esquerda é +X
    views = [('01-frente', (0, -4.6, 0.05)), ('02-costas', (0, 4.6, 0.05)),
             ('03-esquerda', (4.6, 0, 0.05)), ('04-direita', (-4.6, 0, 0.05)),
             ('05-cima', (0, 0.001, 5.4)), ('06-baixo', (0, 0.001, -4.2))]
    tgt = bpy.data.objects.new('ortho_tgt', None); bpy.context.collection.objects.link(tgt)
    tgt.location = (0, 0, -0.02)
    for name, loc in views:
        bpy.ops.object.camera_add(location=loc)
        cam = bpy.context.active_object
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = 2.42
        c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
        sc.camera = cam
        sc.render.filepath = str(out / f'vista-{name}.png')
        bpy.ops.render.render(write_still=True)
        print('render', name)
        bpy.data.objects.remove(cam, do_unlink=True)

def cmd_hero(out_dir):
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    reset_scene(); world_dark()
    mat = make_material()
    st = import_stalker(); assign_material(st, mat)
    setup_lights_and_ground(); setup_cycles(128, 1280, 800)
    sc = bpy.context.scene
    bpy.ops.object.camera_add(location=(2.95, -3.75, 1.28))
    cam = bpy.context.active_object
    cam.data.lens = 34
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = 4.85
    cam.data.dof.aperture_fstop = 3.4
    tgt = bpy.data.objects.new('hero_tgt', None); bpy.context.collection.objects.link(tgt)
    tgt.location = (0, 0, 0.18)
    c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    sc.camera = cam
    sc.render.filepath = str(out / 'hero-3q.png')
    bpy.ops.render.render(write_still=True)
    print('hero renderizado')

def cmd_poses(pose_dir, out_dir):
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    for obj_file in sorted(Path(pose_dir).glob('*.obj')):
        reset_scene()
        mat = make_material()
        world_dark(0.05, (0.075, 0.085, 0.10))
        bpy.ops.wm.obj_import(filepath=str(obj_file))
        st = bpy.context.selected_objects[0]
        st.name = 'pose_mesh'
        st.rotation_euler = (math.radians(90), 0, 0)   # OBJ sai em glTF Y-up — roda para Z-up
        assign_material(st, mat)
        setup_lights_and_ground(); setup_cycles(80, 960, 540)
        sc = bpy.context.scene
        bpy.context.view_layer.update()
        from mathutils import Vector
        bb = [st.matrix_world @ Vector(corner) for corner in st.bound_box]
        cx = sum(v.x for v in bb) / 8; cy = sum(v.y for v in bb) / 8; cz = sum(v.z for v in bb) / 8
        bpy.ops.object.camera_add(location=(cx + 2.75, cy - 3.6, cz + 1.0))
        cam = bpy.context.active_object
        cam.data.lens = 33
        tgt = bpy.data.objects.new('pose_tgt', None); bpy.context.collection.objects.link(tgt)
        tgt.location = (cx, cy, cz)
        c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
        sc.camera = cam
        sc.render.filepath = str(out / (obj_file.stem + '.png'))
        bpy.ops.render.render(write_still=True)
        print('pose', obj_file.name)

def cmd_video(track_dir, out_dir, f0=0, f1=None):
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    track = json.loads((Path(track_dir) / 'track.json').read_text())
    vcount = track['vcount']
    reset_scene(); world_dark()
    mat = make_material()
    st = import_stalker(); assign_material(st, mat)
    setup_lights_and_ground(); setup_cycles(18, 640, 360)
    sc = bpy.context.scene
    bpy.ops.object.camera_add(location=(3.0, -4.0, 1.3))
    cam = bpy.context.active_object
    cam.data.lens = 30
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = 5.0
    cam.data.dof.aperture_fstop = 4.0
    tgt = bpy.data.objects.new('vid_tgt', None); bpy.context.collection.objects.link(tgt)
    tgt.location = (0, 0, 0.05)
    c = cam.constraints.new('TRACK_TO'); c.target = tgt; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    sc.camera = cam
    import numpy as np
    me = st.data
    pos_attr = np.empty(vcount, dtype=[('co', 'f4', (3,))])
    nrm_attr = np.empty(vcount, dtype=[('co', 'f4', (3,))])
    for f in range(f0, f1 if f1 is not None else track['frames']):
        binfile = Path(track_dir) / f'{f:04d}.bin'
        data = np.fromfile(binfile, dtype='f4')
        co = data[: vcount * 3].reshape(vcount, 3)
        nrm = data[vcount * 3:].reshape(vcount, 3)
        # glTF Y-up → Blender Z-up: (x, y, z)_blender = (x, -z, y)_gltf  (importador fez o mesmo)
        bl_co = np.column_stack([co[:, 0], -co[:, 2], co[:, 1]])
        me.vertices.foreach_set('co', bl_co.reshape(-1))
        me.update()
        sc.render.filepath = str(out / f'frame-{f:04d}.png')
        bpy.ops.render.render(write_still=True)
        if f % 24 == 0:
            print('video frame', f)
    print('video: ', track['frames'], 'frames em', out)

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    mode = args[0]
    if mode == '--views':
        cmd_stills(args[1])
    elif mode == '--hero':
        cmd_hero(args[1])
    elif mode == '--poses':
        cmd_poses(args[1], args[2])
    elif mode == '--video':
        cmd_video(args[1], args[2], int(args[3]) if len(args) > 3 else 0, int(args[4]) if len(args) > 4 else None)
    else:
        raise SystemExit('modo desconhecido: ' + mode)
