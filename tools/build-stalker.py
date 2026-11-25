#!/usr/bin/env python3
"""Build do STALKER — criatura low-poly PSX-moderna para o Backrooms (NSAMBO).

Uso: tools/blender.sh tools/build-stalker.py

Metaballs ELLIPSOID → voxel remesh → decimate (~3000 tris) → UV esférico
(sem operadores de UV) com ilhas de olhos num strip próprio → armature de 21
ossos → actions idle/walk/jaw → GLB em assets/models/stalker.glb.

Anatomia tirada do conceito (assets/textures/stalker/stalker-concept.jpg):
corcunda, crânio alongado para a frente, braços abaixo dos joelhos,
pernas digitígradas, ombros assimétricos.
"""
import bpy
import math
import sys
from mathutils import Vector

OUT_GLB = '/home/user/Nsambo/assets/models/stalker.glb'
TARGET_TRIS = 3000
VOXEL = 0.028
# ilhas de olhos no strip livre da albedo (u ∈ [0.86, 1.0])
EYE_PATCH = ((0.862, 0.315, 0.925, 0.465),
             (0.862, 0.535, 0.925, 0.685))
EYE_L = (-0.058, 0.318, 1.512)
EYE_R = (0.058, 0.318, 1.512)
EYE_RADIUS = 0.055

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def new_from_evaluated(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    return bpy.data.meshes.new_from_object(obj.evaluated_get(deps))

def main():
    reset()
    # ══ 1. CORPO — primitivas (esferas/cilindros) unidas pelo remesh ═
    from mathutils import Vector as _V

    def add_uv_sphere(name, loc, radii, seg=18, ring=12):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring, location=loc)
        o = bpy.context.active_object
        o.name = name
        o.scale = radii
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        return o

    def add_cone_tube(name, p0, p1, r0, r1, seg=12):
        p0, p1 = _V(p0), _V(p1)
        d = p1 - p0
        length = d.length
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r0,
                                        depth=length, location=(p0 + p1) / 2)
        o = bpy.context.active_object
        o.name = name
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        return o

    prims = []
    def S(name, loc, radii, seg=18, ring=12):
        prims.append(add_uv_sphere(name, loc, radii, seg, ring))
    def T(name, p0, p1, r0, r1, seg=14):
        prims.append(add_cone_tube(name, p0, p1, r0, r1, seg))

    # bacia / abdómen / peito / corcunda
    S('pelvis', (0.00, -0.01, 0.905), (0.225, 0.185, 0.16))
    S('abdomen', (0.00, 0.005, 1.06), (0.20, 0.165, 0.165))
    S('chest', (0.00, 0.015, 1.225), (0.23, 0.18, 0.20))
    S('hump', (0.00, -0.115, 1.375), (0.215, 0.15, 0.155))
    S('dorsal_L', (-0.135, -0.06, 1.315), (0.13, 0.11, 0.12))
    S('dorsal_R', (0.145, -0.055, 1.32), (0.13, 0.11, 0.12))
    # ombros assimétricos
    S('shoulder_L', (-0.255, 0.025, 1.40), (0.145, 0.14, 0.145))
    S('shoulder_R', (0.265, 0.04, 1.42), (0.155, 0.15, 0.155))
    # pescoço (inclinado para a frente)
    T('neck', (0.00, 0.045, 1.42), (0.00, 0.085, 1.50), 0.095, 0.082)
    # cabeça: crânio alongado, occipital, brow, mandíbula, garganta
    S('skull', (0.00, 0.145, 1.555), (0.145, 0.165, 0.125))
    S('occiput', (0.00, 0.05, 1.575), (0.125, 0.12, 0.105))
    S('brow', (0.00, 0.245, 1.54), (0.118, 0.09, 0.078))
    S('jaw', (0.00, 0.24, 1.432), (0.105, 0.135, 0.082))
    S('throat', (0.00, 0.155, 1.42), (0.092, 0.098, 0.078))
    # braços (livres do tronco a partir do cotovelo)
    S('deltoid_L', (-0.265, 0.025, 1.36), (0.10, 0.098, 0.10))
    S('deltoid_R', (0.275, 0.04, 1.375), (0.105, 0.102, 0.105))
    T('upper_L', (-0.285, 0.025, 1.385), (-0.345, 0.032, 1.155), 0.078, 0.060)
    T('upper_R', (0.295, 0.04, 1.40), (0.355, 0.045, 1.165), 0.082, 0.062)
    S('elbow_L', (-0.345, 0.032, 1.155), (0.062, 0.062, 0.062))
    S('elbow_R', (0.355, 0.045, 1.165), (0.064, 0.064, 0.064))
    T('fore_L', (-0.345, 0.032, 1.16), (-0.385, 0.045, 0.475), 0.056, 0.040)
    T('fore_R', (0.355, 0.045, 1.17), (0.395, 0.052, 0.48), 0.058, 0.042)
    S('hand_L', (-0.39, 0.05, 0.40), (0.052, 0.054, 0.093))
    S('hand_R', (0.40, 0.06, 0.40), (0.055, 0.056, 0.098))
    S('knuckles_L', (-0.39, 0.053, 0.315), (0.049, 0.040, 0.034))
    S('knuckles_R', (0.40, 0.063, 0.315), (0.052, 0.042, 0.036))
    claw_xs_L = [-0.42, -0.39, -0.36]
    claw_xs_R = [0.37, 0.40, 0.43]
    for i, cx in enumerate(claw_xs_L):
        T(f'claw_L{i}', (cx, 0.052, 0.325), (cx, 0.058, 0.125), 0.0125, 0.0080, 8)
        T(f'tip_L{i}', (cx, 0.058, 0.125), (cx, 0.062, 0.015), 0.0080, 0.0015, 8)
    for i, cx in enumerate(claw_xs_R):
        T(f'claw_R{i}', (cx, 0.062, 0.325), (cx, 0.068, 0.125), 0.0125, 0.0080, 8)
        T(f'tip_R{i}', (cx, 0.068, 0.125), (cx, 0.072, 0.015), 0.0080, 0.0015, 8)
    # pernas digitígradas
    T('thigh_L', (-0.16, 0.0, 0.775), (-0.172, 0.045, 0.435), 0.108, 0.078)
    T('thigh_R', (0.16, 0.0, 0.775), (0.175, 0.042, 0.43), 0.105, 0.076)
    S('knee_L', (-0.172, 0.045, 0.435), (0.073, 0.073, 0.073))
    S('knee_R', (0.175, 0.042, 0.43), (0.071, 0.071, 0.071))
    T('calf_L', (-0.172, 0.045, 0.44), (-0.172, -0.018, 0.10), 0.070, 0.041)
    T('calf_R', (0.175, 0.042, 0.435), (0.175, -0.022, 0.098), 0.068, 0.040)
    S('hock_L', (-0.172, -0.018, 0.10), (0.045, 0.048, 0.042))
    S('hock_R', (0.175, -0.022, 0.098), (0.044, 0.047, 0.041))
    T('pastern_L', (-0.172, -0.018, 0.10), (-0.172, 0.085, 0.028), 0.038, 0.028)
    T('pastern_R', (0.175, -0.022, 0.098), (0.175, 0.083, 0.027), 0.037, 0.027)
    S('foot_L', (-0.172, 0.075, 0.038), (0.072, 0.088, 0.036))
    S('foot_R', (0.175, 0.075, 0.038), (0.070, 0.085, 0.036))
    toe_dx = [-0.033, 0.0, 0.033]
    for i, dx in enumerate(toe_dx):
        T(f'toe_L{i}', (-0.172 + dx, 0.145, 0.028), (-0.172 + dx * 1.15, 0.215, 0.021), 0.0155, 0.0095, 7)
        T(f'toe_R{i}', (0.175 + dx, 0.145, 0.028), (0.175 + dx * 1.15, 0.215, 0.021), 0.0155, 0.0095, 7)

    bpy.ops.object.select_all(action='DESELECT')
    for o in prims:
        o.select_set(True)
    bpy.context.view_layer.objects.active = prims[0]
    bpy.ops.object.join()
    body = bpy.context.active_object
    body.name = 'Stalker'

    m1 = new_from_evaluated(body)          # primitivas unidas → mesh estático
    bpy.data.objects.remove(body, do_unlink=True)
    body = bpy.data.objects.new('Stalker', m1)
    bpy.context.collection.objects.link(body)
    print(f'[stalker] z após join: [{min(v.co.z for v in m1.vertices):.3f},{max(v.co.z for v in m1.vertices):.3f}]')
    print(f'[stalker] dims body: {tuple(round(d,3) for d in body.dimensions)} loc {tuple(round(c,3) for c in body.location)}')
    rem = body.modifiers.new('remesh', 'REMESH')
    rem.mode = 'VOXEL'
    rem.voxel_size = VOXEL
    rem.use_smooth_shade = True
    m1 = new_from_evaluated(body)
    bpy.data.objects.remove(body, do_unlink=True)
    body = bpy.data.objects.new('Stalker', m1)
    bpy.context.collection.objects.link(body)
    tris0 = sum(len(p.vertices) for p in m1.polygons)
    print(f'[stalker] tris no remesh: {tris0}')
    print(f'[stalker] z após remesh: [{min(v.co.z for v in m1.vertices):.3f},{max(v.co.z for v in m1.vertices):.3f}]')
    dec = body.modifiers.new('decimate', 'DECIMATE')
    dec.decimate_type = 'COLLAPSE'
    dec.ratio = max(0.05, TARGET_TRIS / max(1, tris0))
    m2 = new_from_evaluated(body)
    bpy.data.objects.remove(body, do_unlink=True)
    body = bpy.data.objects.new('Stalker', m2)
    bpy.context.collection.objects.link(body)
    m2.validate(verbose=False, clean_customdata=True)
    # remover faces degeneradas para o GLB passar validação limpa
    try:
        import bmesh
        bm = bmesh.new()
        bm.from_mesh(m2)
        bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges[:])
        bm.to_mesh(m2)
        bm.free()
        m2.validate(verbose=False)
        m2.update()
        print('[stalker] degeneradas removidas; faces:', len(m2.polygons))
    except Exception as e:
        print('[stalker] AVISO dissolve_degenerate falhou:', e)
    for p in m2.polygons:
        p.use_smooth = True
    print(f'[stalker] z após dissolve: [{min(v.co.z for v in m2.vertices):.3f},{max(v.co.z for v in m2.vertices):.3f}]')
    print(f'[stalker] tris finais: {sum(len(p.vertices) for p in m2.polygons)}')
    print(f'[stalker] z após decimate: [{min(v.co.z for v in m2.vertices):.3f},{max(v.co.z for v in m2.vertices):.3f}]')

    # ══ 2. UV esférico (determinístico, sem operadores) ═════════════
    uv = m2.uv_layers.new(name='UVMap')
    for li, loop in enumerate(m2.loops):
        v = m2.vertices[loop.vertex_index].co
        u = math.atan2(v.x, v.y) / (2 * math.pi) + 0.5
        vv = max(0.0, min(1.0, (v.z + 0.05) / 1.85))
        uv.data[li].uv = (u * 0.84, vv)
    # ilhas de olhos → strip livre
    def nearest_faces(eye, n):
        scored = []
        for fi, p in enumerate(m2.polygons):
            d = (p.center - Vector(eye)).length
            fwd = p.normal.y  # >0 = face virada para a frente (+y)
            scored.append((d - (0.05 if fwd > 0.45 else 0.0), d, fi))
        scored.sort(key=lambda t: t[0])
        return [fi for _, _, fi in scored[:n]]
    EYE_FACES = 4
    eye_faces = [(fi, 0) for fi in nearest_faces(EYE_L, EYE_FACES)]
    eye_faces += [(fi, 1) for fi in nearest_faces(EYE_R, EYE_FACES)]
    print(f'[stalker] faces de olhos: {len(eye_faces)}')
    print(f'[stalker] z após UV/olhos: [{min(v.co.z for v in m2.vertices):.3f},{max(v.co.z for v in m2.vertices):.3f}]')
    for fi, eye in eye_faces:
        r = EYE_PATCH[eye]
        loops = list(m2.polygons[fi].loop_indices)
        uvs = [uv.data[li].uv.copy() for li in loops]
        u0, v0 = min(u for u, _ in uvs), min(v for _, v in uvs)
        u1, v1 = max(u for u, _ in uvs), max(v for _, v in uvs)
        du, dv = max(u1 - u0, 1e-6), max(v1 - v0, 1e-6)
        for li, (u, v) in zip(loops, uvs):
            uv.data[li].uv = (r[0] + (u - u0) / du * (r[2] - r[0]),
                              r[1] + (v - v0) / dv * (r[3] - r[1]))

    # ══ 3. Armature — 21 ossos ══════════════════════════════════════
    arm = bpy.data.armatures.new('StalkerRig')
    arm_obj = bpy.data.objects.new('Armature', arm)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode='EDIT')
    bdefs = {
        'hips':      ((0.0, 0.0, 0.78),  (0.0, 0.0, 1.02), None),
        'spine1':    ((0.0, 0.0, 1.02), (0.0, 0.01, 1.19), 'hips'),
        'spine2':    ((0.0, 0.01, 1.19),(0.0, 0.02, 1.32), 'spine1'),
        'chest':     ((0.0, 0.02, 1.32), (0.0, 0.02, 1.45), 'spine2'),
        'neck':      ((0.0, 0.035, 1.44),(0.0, 0.065, 1.49), 'chest'),
        'head':      ((0.0, 0.065, 1.49),(0.0, 0.155, 1.665), 'neck'),
        'jaw':       ((0.0, 0.20, 1.455),(0.0, 0.28, 1.405), 'head'),
        'shoulder.L':((-0.15, 0.02, 1.42),(-0.26, 0.025, 1.40), 'chest'),
        'shoulder.R':((0.15, 0.03, 1.425),(0.265, 0.04, 1.42), 'chest'),
        'upper_arm.L':((-0.26, 0.025, 1.40),(-0.345, 0.032, 1.16), 'shoulder.L'),
        'upper_arm.R':((0.265, 0.04, 1.42),(0.355, 0.045, 1.165), 'shoulder.R'),
        'forearm.L':((-0.345, 0.032, 1.16),(-0.385, 0.045, 0.475), 'upper_arm.L'),
        'forearm.R':((0.355, 0.045, 1.165),(0.395, 0.052, 0.48), 'upper_arm.R'),
        'hand.L':    ((-0.385, 0.045, 0.475),(-0.392, 0.052, 0.27), 'forearm.L'),
        'hand.R':    ((0.395, 0.052, 0.48),(0.402, 0.06, 0.27), 'forearm.R'),
        'thigh.L':   ((-0.14, 0.0, 0.78),(-0.165, 0.035, 0.42), 'hips'),
        'thigh.R':   ((0.145, 0.0, 0.775),(0.17, 0.032, 0.415), 'hips'),
        'calf.L':    ((-0.165, 0.035, 0.42),(-0.168, -0.012, 0.095), 'thigh.L'),
        'calf.R':    ((0.17, 0.032, 0.415),(0.172, -0.017, 0.09), 'thigh.R'),
        'foot.L':    ((-0.168, -0.012, 0.095),(-0.168, 0.20, 0.015), 'calf.L'),
        'foot.R':    ((0.172, -0.017, 0.09),(0.172, 0.20, 0.015), 'calf.R'),
    }
    eb = {}
    for name, (h, t, parent) in bdefs.items():
        b = arm.edit_bones.new(name)
        b.head = h; b.tail = t
        eb[name] = b
    for name, (h, t, parent) in bdefs.items():
        if parent:
            eb[name].parent = eb[parent]
    bpy.ops.object.mode_set(mode='OBJECT')

    body.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    print(f'[stalker] z após parent: [{min(v.co.z for v in body.data.vertices):.3f},{max(v.co.z for v in body.data.vertices):.3f}]')
    print('[stalker] vertex groups:', len(body.vertex_groups))

    # ══ 4. Actions ═══════════════════════════════════════════════════
    def key(bone, frame, rot=None, scale=None):
        bone.rotation_mode = 'XYZ'
        if rot is not None: bone.rotation_euler = rot
        if scale is not None: bone.scale = scale
        if rot is not None: bone.keyframe_insert('rotation_euler', frame=frame, group=bone.name)
        if scale is not None: bone.keyframe_insert('scale', frame=frame, group=bone.name)

    arm_obj.animation_data_create()
    ad = arm_obj.animation_data
    bpy.ops.object.mode_set(mode='POSE')
    P = {b.name: b for b in arm_obj.pose.bones}

    act = bpy.data.actions.new('idle')
    ad.action = act
    for f, s in [(1, 1.0), (24, 1.055), (38, 1.02), (52, 1.0), (72, 1.06), (96, 1.0)]:
        key(P['chest'], f, rot=(0.02, 0.0, 0.0), scale=(1.0, s, 1.07))
    for f, r in [(1, 0.03), (30, -0.05), (61, 0.05), (96, 0.03)]:
        key(P['head'], f, rot=(r, 0.04, 0.02))

    act = bpy.data.actions.new('walk')
    ad.action = act
    for f in [1, 7, 13, 19, 25, 31, 37, 43, 49]:
        t = (f - 1) / 48.0 * 2 * math.pi
        key(P['thigh.L'], f, rot=(math.sin(t) * 0.42, 0, 0))
        key(P['thigh.R'], f, rot=(-math.sin(t) * 0.30, 0, 0))
        key(P['calf.L'], f, rot=(max(0.0, -math.sin(t)) * 0.85 + 0.08, 0, 0))
        key(P['calf.R'], f, rot=(max(0.0, math.sin(t)) * 0.80 + 0.08, 0, 0))
        key(P['forearm.L'], f, rot=(-math.sin(t) * 0.42, 0, 0.10))
        key(P['forearm.R'], f, rot=(math.sin(t) * 0.34, 0, -0.10))
        key(P['foot.L'], f, rot=(-math.sin(t) * 0.3, 0, 0))
        key(P['foot.R'], f, rot=(math.sin(t) * 0.3, 0, 0))
        key(P['spine1'], f, rot=(0, 0, math.sin(t * 0.5) * 0.05))
        key(P['spine2'], f, rot=(0.05, 0.04, math.sin(t * 0.5 + 1.2) * 0.06))
        key(P['head'], f, rot=(0.12 + math.sin(t * 2) * 0.03, 0, math.sin(t * 0.5) * 0.08))

    act = bpy.data.actions.new('jaw')
    ad.action = act
    for f, r in [(1, 0.0), (12, 0.28), (24, 0.48), (48, 0.55)]:
        key(P['jaw'], f, rot=(r, 0, 0))

    bpy.ops.object.mode_set(mode='OBJECT')
    for name in ['idle', 'walk', 'jaw']:
        track = ad.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, bpy.data.actions[name])
    ad.action = None
    bpy.ops.object.mode_set(mode='OBJECT')
    print(f'[stalker] z após acções: [{min(v.co.z for v in body.data.vertices):.3f},{max(v.co.z for v in body.data.vertices):.3f}]')

    # ══ 4b. Escala global para 1.80 m (corcunda ≈ 92% da altura de pé) ══
    SCALE_H = 1.80 / (max(v.co.z for v in body.data.vertices) - min(v.co.z for v in body.data.vertices))
    if abs(SCALE_H - 1.0) > 0.001:
        from mathutils import Matrix
        body.data.transform(Matrix.Scale(SCALE_H, 4))
        bpy.ops.object.mode_set(mode='EDIT')
        for b in arm.edit_bones:
            b.head = b.head * SCALE_H
            b.tail = b.tail * SCALE_H
        bpy.ops.object.mode_set(mode='OBJECT')
        print(f'[stalker] escala global aplicada: {SCALE_H:.4f}')

    # ══ 5. Material placeholder (o motor usa bindSet próprio) ════════
    mat = bpy.data.materials.new('StalkerSkin')
    mat.diffuse_color = (0.28, 0.08, 0.07, 1.0)
    body.data.materials.append(mat)

    # ══ 6. Export GLB ════════════════════════════════════════════════
    zs = [v.co.z for v in body.data.vertices]
    print(f'[stalker] pré-export data z [{min(zs):.3f},{max(zs):.3f}]')
    sc = bpy.context.scene
    print(f'[stalker] frame atual: {sc.frame_current}')
    # força frame de repouso e pose neutra antes de exportar
    sc.frame_set(1)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.loc_clear(); bpy.ops.pose.rot_clear(); bpy.ops.pose.scale_clear()
    bpy.ops.object.mode_set(mode='OBJECT')
    zs = [v.co.z for v in body.data.vertices]
    print(f'[stalker] pós pose-clear z [{min(zs):.3f},{max(zs):.3f}]')
    bpy.ops.export_scene.gltf(
        filepath=OUT_GLB,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_yup=True,
    )
    print('[stalker] exportado →', OUT_GLB)

main()
