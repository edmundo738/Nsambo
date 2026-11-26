# HUNYUAN3D — geração de modelos 3D (faca e outros ativos)

Objetivo: gerar modelos 3D para o NSAMBO com o **Tencent Hunyuan3D-2** (image→3D),
em vez de comprar/baixar packs. Primeiro alvo: a **faca** (mecânica exemplo do menu BUILD).

## O que este repositório já tem (feito no sandbox)

| Item | Onde | Estado |
|---|---|---|
| Imagem de referência da faca (input do Hunyuan) | `assets/hunyuan3d/knife-reference.png` | ✅ gerada (objeto único, fundo branco) |
| Importador/validador de GLB → `assets/models/` | `tools/hunyuan3d/import-asset.mjs` | ✅ testado (leu `psx_house_key.glb`: 60 tris, bounds, texturas embutidas) |
| Este guia | `docs/HUNYUAN3D.md` | ✅ |

**O que NÃO foi possível fazer aqui:** correr o Hunyuan3D. O sandbox não tem GPU
(`nvidia-smi` ausente), tem 3 GB de RAM, e os pesos vivem no Hugging Face
(fora dos hosts permitidos). O Hunyuan exige 6 GB de VRAM (só forma, modelo
`Hunyuan3D-2mini`/Turbo) ou ~16 GB (forma + textura, `Hunyuan3D-2`).
👉 **A geração tem de ser feita na tua máquina (Windows com GPU NVIDIA) ou no site/HF.**

## Licença (lê antes de publicar)

Tencent **Hunyuan 3D 2.0 Community License**:
- ❌ Não se aplica à UE, Reino Unido e Coreia do Sul (Angola está fora — ok para ti).
- Acceptable Use Policy anexo (nada de usos ilícitos/enganosos; manter o aviso se redistribuíres).
- A Tencent **não reivindica direitos sobre os outputs** que geras — o modelo que sair daqui, é teu para usar no jogo.
- O código do repo é open source (Apache-style); os pesos seguem a licença community acima.
- Quando o modelo for integrado: adicionar entrada em `ATTRIBUTIONS.md` (o importador imprime o stub).

## Caminho RÁPIDO — sem instalar nada (recomendado)

1. Vai ao site oficial: **https://3d.hunyuan.tencent.com/**
2. Sobe `assets/hunyuan3d/knife-reference.png`
3. Gera (Turbo, se disponível). Exporta **GLB**.
4. Traz o `.glb` para cá e corre:
   ```bash
   node tools/hunyuan3d/import-asset.mjs ~/Downloads/knife.glb --out assets/models/psx_knife.glb --max-tris 3000
   ```
   (o `--max-tris` simplifica via `gltf-transform` — precisa de net para o npx na primeira vez)
5. Avisa (ou deixo eu) integrar no jogo: loader em `app/src/backrooms/main.js` (`_loadModels`),
   viewmodel + sway, nome no BUILD ("Faca"), ATTRIBUTIONS.md.

Alternativas grátis sem GPU: o demo no Hugging Face (tencent/Hunyuan3D-2) e o
Hunyuan3D Studio (web). Todas processam no servidor — não precisa de install.

## Caminho LOCAL — Windows com GPU NVIDIA (6–16 GB VRAM)

Pré-requisitos: Windows 10/11, Python 3.10–3.11, Git, GPU NVIDIA com drivers CUDA recentes.

```powershell
git clone https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git
cd Hunyuan3D-2
python -m venv .venv; .\.venv\Scripts\Activate.ps1
# torch com CUDA (ajusta o índice à tua versão CUDA — ver pytorch.org)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
pip install -e .
# compiladores custom (necessários para a textura)
cd hy3dgen\texgen\custom_rasterizer; python setup.py install; cd ..\..\..
cd hy3dgen\texgen\differentiable_renderer; python setup.py install; cd ..\..\..
```

Download dos pesos (~medidos em GB — precisa de espaço e rede até ao HF):
```powershell
pip install huggingface_hub
huggingface-cli download tencent/Hunyuan3D-2 --include "hunyuan3d-dit-v2-0/*" --exclude "*.md"
# se só tens 6 GB VRAM, usa o mini Turbo:
huggingface-cli download tencent/Hunyuan3D-2mini --include "hunyuan3d-dit-v2-mini-turbo/*"
```

Gerar a faca:
```powershell
# só a forma (6 GB VRAM)
python minimal_demo.py assets/hunyuan3d/knife-reference.png --save knife.glb --use_mini_turbo
# forma + textura (16 GB VRAM)
python gradio_app.py --model_path tencent/Hunyuan3D-2 --subfolder hunyuan3d-dit-v2-0 --texgen_model_path tencent/Hunyuan3D-2 --low_vram_mode
# → http://localhost:7860 · sobe a imagem · Download GLB
```

Notas:
- Gerar com PBR (Paint) dá textura metálica à lâmina e madeira ao cabo — combina com o PSX da casa.
- Se a forma vier com 30k+ tris, o importador reduz para o alvo (`--max-tris 3000`).
- Origem/eixo: os GLBs do Hunyuan vêm com o objeto centrado — no jogo, o viewmodel
  aplica a sua própria matrix (como a lanterna/chave), por isso não precisas de o orientar à mão.

## Pós-processo → jogo

```bash
node tools/hunyuan3d/import-asset.mjs knife.glb --out assets/models/psx_knife.glb --max-tris 3000
```
Verificações automáticas do script: magic GLB v2 · meshes presentes · ≥1 primitiva ·
bounds lidos · texturas 100% embutidas (o jogo não aceita URIs externas).

Depois:
1. `assets/models/psx_knife.glb` commitado (via publicDir é servido como `/models/psx_knife.glb`)
2. `ATTRIBUTIONS.md` ← entrada impressa pelo importador
3. Integração: `_loadModels()` (lista de GLBs junto de `psx_house_key.glb`…),
   viewmodel da mão direita ou troca pela lanterna com **Q**/**3**, e botão no menu **BUILD**
   («FACA: empunhar») para a testar na GALERIA DEV sem procurar.

## Prompt/imagem de referência

`assets/hunyuan3d/knife-reference.png` — faca de caça, lâmina aço com fuller, cabo de madeira escura com pinos de latão, **fundo branco limpo, objeto único centrado** (formato que o Hunyuan espera). Se quiseres outra faca (faca de combate, karambit, machete), gera nova referência e refaz o passo 3.

## Estado / próximos passos

- [x] Imagem de referência
- [x] Pipeline de import GLB validado
- [ ] **Tu** geras o GLB (site ou local, à tua escolha)
- [ ] Import + integração no jogo (faca testável na GALERIA DEV)
- [ ] ATTRIBUTIONS.md com a entrada final
