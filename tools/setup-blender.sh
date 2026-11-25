#!/bin/bash
# setup-blender.sh — instala Blender (módulo bpy 5.x) + deps de runtime X/GL no
# prefixo app/tools/.blender-libs, em Debian/Ubuntu SEM acesso a mirrors de sistema.
# Porque: os wheels bpy do PyPI não trazem libXrender/libXi/libXfixes/libSM/libICE/
# libxkbcommon/libGL, e o ambiente só alcança github.com + pypi.org.
# Fontes oficiais (mirrors read-only do freedesktop / NVIDIA / xkbcommon / xorgproto).
# Idempotente. Correr de qualquer lado: bash tools/setup-blender.sh
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$REPO/app"
PREFIX="$APP/tools/.blender-libs"
VENV="$APP/tools/.venv-blender"
WORK=/tmp/blender-deps
PY="$VENV/bin/python"

command -v git >/dev/null || { echo 'falta git'; exit 1; }
mkdir -p "$WORK" "$PREFIX"/{lib,include}
cd "$WORK"

echo '── [1/7] venv bpy ─────────────────────────────────────────────'
[ -d "$VENV" ] || python3 -m venv "$VENV"
"$PY" -m pip install --quiet --upgrade pip
"$PY" -m pip install --quiet bpy meson ninja pkgconf

echo '── [2/7] clonar fontes (shallow) ───────────────────────────────'
clone() { [ -d "$2" ] || git clone --depth 1 "https://github.com/$1.git" "$2"; }
clone GlassOnTin/xorgproto xorgproto
clone freedesktop-unofficial-mirror/xorg__proto__xextproto xextproto
clone freedesktop-unofficial-mirror/xorg__lib__libX11 libX11
clone freedesktop-unofficial-mirror/xorg__lib__libXrender libXrender
clone freedesktop-unofficial-mirror/xorg__lib__libXfixes libXfixes
clone freedesktop-unofficial-mirror/xorg__lib__libXi libXi
clone freedesktop-unofficial-mirror/xorg__lib__libSM libSM
clone freedesktop-unofficial-mirror/xorg__lib__libICE libICE
clone freedesktop-unofficial-mirror/xorg__lib__libXext libXext
clone freedesktop-unofficial-mirror/xorg__lib__libxtrans libxtrans
clone xkbcommon/libxkbcommon libxkbcommon
clone NVIDIA/libglvnd libglvnd

echo '── [3/7] headers (sem compilar libX11 — runtime do sistema serve) ──'
cp -r xorgproto/include/GL "$PREFIX/include/"
cp -r xorgproto/include/X11/. "$PREFIX/include/X11/"
mkdir -p "$PREFIX/include/X11/Xtrans" "$PREFIX/include/X11/extensions" "$PREFIX/include/uuid"
cp xextproto/*.h "$PREFIX/include/X11/extensions/"
cp libxtrans/Xtrans*.h libxtrans/Xtranslcl.c libxtrans/Xtranssock.c libxtrans/Xtransutil.c libxtrans/Xtrans.c libxtrans/transport.c "$PREFIX/include/X11/Xtrans/"
cp -r libX11/include/X11/. "$PREFIX/include/X11/"
sed -e 's/#undef XTHREADS/#define XTHREADS 1/' -e 's/#undef XUSE_MTSAFE_API/#define XUSE_MTSAFE_API 1/' \
    libX11/include/X11/XlibConf.h.in > "$PREFIX/include/X11/XlibConf.h"
cp -r libICE/include/X11/ICE "$PREFIX/include/X11/"
cp -r libSM/include/X11/SM "$PREFIX/include/X11/"
cp libXrender/include/X11/extensions/*.h "$PREFIX/include/X11/extensions/"
cp libXfixes/include/X11/extensions/*.h "$PREFIX/include/X11/extensions/"
cp libXi/include/X11/extensions/*.h "$PREFIX/include/X11/extensions/"
cp libXext/include/X11/extensions/*.h "$PREFIX/include/X11/extensions/"   # Xext.h, extutil.h, Xge.h…
cat > "$PREFIX/include/uuid/uuid.h" << 'EOF'
/* Declarações mínimas ABI-compatíveis com util-linux libuuid.so.1 (runtime do sistema). */
#ifndef _BL_UUID_UUID_H
#define _BL_UUID_UUID_H
#include <stddef.h>
typedef unsigned char uuid_t[16];
#define UUID_LEN 37
void uuid_generate(uuid_t out);
void uuid_unparse_lower(const uuid_t uu, char *out);
void uuid_unparse(const uuid_t uu, char *out);
int uuid_is_null(const uuid_t uu);
#endif
EOF
cat > "$PREFIX/include/config.h" << 'EOF'
#ifndef _XORG_MINIMAL_CONFIG_H
#define _XORG_MINIMAL_CONFIG_H
#define HAVE_STDBOOL_H 1
#define HAVE_STDINT_H 1
#define HAVE_UNISTD_H 1
#define HAVE_LIBC_H 1
#define HAVE_ASPRINTF 1
#define HAVE_VASPRINTF 1
#endif
EOF

echo '── [4/7] symlinks p/ runtimes do sistema (sem -dev packages) ───'
SYS=$(ls -d /usr/lib/x86_64-linux-gnu /lib/x86_64-linux-gnu 2>/dev/null | head -1)
ln -sf "$SYS/libX11.so.6" "$PREFIX/lib/libX11.so"
ln -sf "$SYS/libXext.so.6" "$PREFIX/lib/libXext.so"
ln -sf "$SYS/libuuid.so.1" "$PREFIX/lib/libuuid.so"

echo '── [5/7] compilar libICE, libSM, libXrender, libXfixes, libXi ───'
LIB="$PREFIX/lib" INCLUDES="-I$PREFIX/include -I$PREFIX/include/X11/extensions -I. -Iinclude"
cd "$WORK/libICE"
cc -O2 -fPIC -shared -D_GNU_SOURCE -DHAVE_ASPRINTF -DHAVE_VASPRINTF -DICE_t -DTRANS_CLIENT -DTRANS_SERVER -DTRANS_REOPEN \
   -Wl,-soname,libICE.so.6 -o "$LIB/libICE.so.6.3.0" src/*.c $INCLUDES
ln -sf libICE.so.6.3.0 "$LIB/libICE.so.6"; ln -sf libICE.so.6.3.0 "$LIB/libICE.so"
cd "$WORK/libSM"
cc -O2 -fPIC -shared -D_GNU_SOURCE -DHAVE_LIBUUID -Wl,-soname,libSM.so.6 -o "$LIB/libSM.so.6.0.1" src/*.c $INCLUDES -L"$LIB" -lICE -L"$SYS" -luuid
ln -sf libSM.so.6.0.1 "$LIB/libSM.so.6"; ln -sf libSM.so.6.0.1 "$LIB/libSM.so"
cd "$WORK/libXrender"
cc -O2 -fPIC -shared -D_GNU_SOURCE -DHAVE_CONFIG_H -Wl,-soname,libXrender.so.1 -o "$LIB/libXrender.so.1.3.1" src/*.c $INCLUDES
ln -sf libXrender.so.1.3.1 "$LIB/libXrender.so.1"; ln -sf libXrender.so.1.3.1 "$LIB/libXrender.so"
cd "$WORK/libXfixes"
cc -O2 -fPIC -shared -D_GNU_SOURCE -DHAVE_CONFIG_H -Wl,-soname,libXfixes.so.3 -o "$LIB/libXfixes.so.3.7.1" src/*.c $INCLUDES -L"$LIB" -lX11
ln -sf libXfixes.so.3.7.1 "$LIB/libXfixes.so.3"; ln -sf libXfixes.so.3.7.1 "$LIB/libXfixes.so"
cd "$WORK/libXi"
SRCS=$(ls src/*.c | grep -v XFreeLst.c)   # XFreeLst.c é EXTRA_DIST upstream (tipo removido do header)
cc -O2 -fPIC -shared -D_GNU_SOURCE -DHAVE_CONFIG_H -Wl,-soname,libXi.so.6 -o "$LIB/libXi.so.6.1.1" $SRCS $INCLUDES -L"$LIB" -lX11 -lXext
ln -sf libXi.so.6.1.1 "$LIB/libXi.so.6"; ln -sf libXi.so.6.1.1 "$LIB/libXi.so"

echo '── [6/7] libxkbcommon + libglvnd (meson; sem bison — parser pré-gerado) ──'
export PATH="$VENV/bin:$PATH"
mkdir -p "$LIB/pkgconfig"
write_pc() { printf 'prefix=%s\nlibdir=${prefix}/lib\nincludedir=${prefix}/include\nName: %s\nDescription: %s\nVersion: %s\nLibs: -L${libdir} %s\nCflags: -I${includedir}\n' "$PREFIX" "$2" "$3" "$4" "$5" > "$LIB/pkgconfig/$1.pc"; }
cat > "$LIB/pkgconfig/xproto.pc"  << 'EOF'
prefix=/home/user/Nsambo/app/tools/.blender-libs
includedir=${prefix}/include
Name: XPROTO
Description: X11 core protocol headers
Version: 7.0.34
Cflags: -I${includedir}
EOF
cat > "$LIB/pkgconfig/glproto.pc" << 'EOF'
prefix=/home/user/Nsambo/app/tools/.blender-libs
includedir=${prefix}/include
Name: GLPROTO
Description: X11 OpenGL protocol headers
Version: 1.4.17
Cflags: -I${includedir}
EOF
cat > "$LIB/pkgconfig/renderproto.pc" << 'EOF'
prefix=/home/user/Nsambo/app/tools/.blender-libs
includedir=${prefix}/include
Name: RENDERPROTO
Description: X11 Render protocol headers
Version: 0.11.1
Cflags: -I${includedir}
EOF
write_pc x11 X11 "X Library" 1.8.7 "-lX11"
write_pc xext XEXT "X11 miscellaneous extensions library" 1.3.6 "-lXext"
cd "$WORK/libxkbcommon"
rm -rf build && meson setup build --prefix="$PREFIX" --buildtype=release \
  -Denable-parser-auto-generation=false -Denable-x11=false -Denable-wayland=false \
  -Denable-xkbregistry=false -Denable-tools=false -Denable-bash-completion=false \
  -Denable-zsh-completion=false -Denable-docs=false
PATH="$VENV/bin:$PATH" ninja -C build install
mv "$LIB/x86_64-linux-gnu"/* "$LIB/" 2>/dev/null || true; rmdir "$LIB/x86_64-linux-gnu" 2>/dev/null || true
cd "$WORK/libglvnd"
rm -rf build && PKG_CONFIG_PATH="$LIB/pkgconfig" PKG_CONFIG_LIBDIR="$LIB/pkgconfig" meson setup build --prefix="$PREFIX" --buildtype=release \
  -Dx11=enabled -Dglx=enabled -Degl=false -Dhgl=false -Dasm=disabled
PKG_CONFIG_PATH="$LIB/pkgconfig" ninja -C build install
if [ -d "$LIB/x86_64-linux-gnu" ]; then cp -r "$LIB/x86_64-linux-gnu/pkgconfig/." "$LIB/pkgconfig/" 2>/dev/null || true; mv "$LIB/x86_64-linux-gnu"/* "$LIB/" 2>/dev/null || true; rmdir "$LIB/x86_64-linux-gnu" 2>/dev/null || true; fi

echo '── [7/7] smoke test (import bpy + load GLB) ───────────────────'
echo "tools/.blender-libs/" >> "$REPO/.git/info/exclude"   # prefix local; binários ficam fora do git
LD_LIBRARY_PATH="$LIB" "$PY" - << 'EOF'
import bpy
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath='/home/user/Nsambo/assets/models/arms_rig.glb')
print('OK — bpy', bpy.app.version_string, '· objetos:', len(bpy.data.objects), '· actions:', len(bpy.data.actions))
EOF
echo '── Blender pronto. Use: tools/blender.sh <script.py> ──'
