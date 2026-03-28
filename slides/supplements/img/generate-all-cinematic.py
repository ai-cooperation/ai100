#!/usr/bin/env python3
"""
Cinematic Image Generation Queue
=================================
為所有補充單元 HTML 簡報生成電影級封面和插圖。

用法：
  # 在 MacBook 上直接跑（透過 SSH 呼叫 ac-mac AI Hub）
  python3 generate-all-cinematic.py

  # 只生某個單元
  python3 generate-all-cinematic.py --unit s10

  # 檢查哪些圖還沒生
  python3 generate-all-cinematic.py --check

  # dry-run 只看 prompt
  python3 generate-all-cinematic.py --dry-run

配額：每日 100 張 pro，每張約 30-90 秒。
全部 38 張圖約需 60-90 分鐘。
"""

import subprocess
import json
import base64
import os
import sys
import time
import argparse
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
IMG_BASE = SCRIPT_DIR  # img/ 目錄本身

# AI Hub API via SSH
def generate_image(prompt: str, output_path: str, provider: str = "gemini_image") -> bool:
    """透過 SSH 呼叫 ac-mac AI Hub 生成圖片"""
    # Escape for shell
    safe_prompt = prompt.replace('"', '\\"').replace("'", "'\\''")
    cmd = f"""ssh ac-mac 'curl -s --max-time 180 -X POST http://127.0.0.1:8760/api/image/generate \
  -H "Content-Type: application/json" \
  -d "{{\\\"prompt\\\": \\\"{safe_prompt}\\\", \\\"provider\\\": \\\"{provider}\\\"}}"'"""

    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=200)
        data = json.loads(result.stdout)
        if data.get("success") and data.get("image_base64"):
            img_bytes = base64.b64decode(data["image_base64"])
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            with open(output_path, "wb") as f:
                f.write(img_bytes)
            size_kb = len(img_bytes) / 1024
            print(f"  ✅ {os.path.basename(output_path)} ({size_kb:.0f}KB)")
            return True
        else:
            err = data.get("error", data.get("message", "unknown"))
            print(f"  ❌ {os.path.basename(output_path)}: {err[:100]}")
            return False
    except Exception as e:
        print(f"  ❌ {os.path.basename(output_path)}: {e}")
        return False


# ═══════════════════════════════════════════════════════════════
# IMAGE DEFINITIONS — 每張圖的 prompt 和輸出路徑
# ═══════════════════════════════════════════════════════════════

IMAGES = {
    # ─── S10: 簡報工具選擇 (5 張) ───
    "s10": [
        {
            "file": "s10/cover.png",
            "desc": "封面：三個工作站發出不同色光的暗室",
            "prompt": "Shot on ARRI Alexa 65 with Zeiss Supreme Prime 35mm, T1.5. Wide establishing shot of three distinct workstations in a dark creative studio, each casting different colored light onto the shared desk surface. Warm amber gold from the left screen, cool clinical blue from the center, emerald teal-green from the right. The screens glow as the only light sources creating dramatic color temperature boundaries. Visible dust motes floating in the light beams. Polished dark wood desk with caustic light patterns. Color grading: Kodak Vision3 500T 5219 pushed one stop. Film grain ISO 800. Anamorphic oval bokeh. Aspect ratio 16:9. Reference: Roger Deakins Blade Runner 2049 neon interiors meets David Fincher surveillance aesthetic. 8K photorealistic.",
        },
        {
            "file": "s10/fork.png",
            "desc": "人的架構力：岔路口的決策者",
            "prompt": "Shot on ARRI Alexa Mini LF with Cooke S7i 32mm, T2.0. Low angle looking up at a solitary figure standing at a three-way fork in a misty mountain path at dawn. Golden hour light breaking through clouds on the right path, cool blue twilight on the left, warm neutral daylight center. Volumetric fog with Tyndall scattering through tree canopy. Silhouetted figure in dark jacket with hands raised in contemplation. Gnarled oak trees framing each path with visible bark and moss. Wet cobblestone with puddle reflections. Color grading: Fujifilm Eterna Vivid 500D. Film grain ISO 500. Shallow depth of field. Aspect ratio 16:9. Reference: Emmanuel Lubezki The Revenant natural light meets Terrence Malick golden hour. 8K photorealistic.",
        },
        {
            "file": "s10/craftsman.png",
            "desc": "引言頁：匠人選工具的雙手特寫",
            "prompt": "Shot on Sony Venice 2 with Cooke Anamorphic 50mm, T2.3. Extreme close-up of weathered craftsman hands selecting a precision tool from organized wooden toolbox. Warm side lighting from vintage desk lamp at 2800K. Hands show visible veins and calloused fingertips. Polished brass and steel tools with specular highlights. Sawdust particles in warm light beam with volumetric scattering. Dark workshop background. Color grading: Kodak Ektachrome 100 VS, saturated golden amber. Film grain ISO 200. Anamorphic horizontal lens flare from lamp. Aspect ratio 16:9. Reference: Barry Jenkins Moonlight intimate vulnerability meets Ozu contemplative compositions. 8K photorealistic.",
        },
        {
            "file": "s10/tracks.png",
            "desc": "時間成本：兩條鐵軌的交匯點",
            "prompt": "Shot on ARRI Alexa Mini with Angenieux Optimo 35mm, T2.8. Cinematic wide shot of two railroad tracks converging at a distant vanishing point during blue hour dawn. Left track lit by warm amber sodium lamps, right track by cool LED blue-white. Convergence point glows with soft golden light. Wet steel rails reflecting both light sources as parallel light trails. Morning mist hovering low above gravel bed. Distant power line towers as silhouettes. Color grading: Fujifilm Provia pushed two stops, electric blue shadows, warm golden highlights at convergence. Film grain ISO 400. Halated warm highlights at edges. Aspect ratio 16:9. Reference: Christopher Nolan Interstellar grandeur meets Roger Deakins Blade Runner 2049 vastness. 8K photorealistic.",
        },
        {
            "file": "s10/triangle.png",
            "desc": "結尾：三角模型俯拍（素描本+筆電+耳機）",
            "prompt": "Shot on ARRI Alexa 65 with Panavision Ultra Vista 28mm, T2.8. Overhead Gods-eye view of a triangular arrangement on dark slate desk. A designers sketchpad at top, a laptop showing code at bottom-left, headphones with sound waveform at bottom-right. Each illuminated by its own spotlight from above: warm gold on sketchpad, teal-green on laptop, cool blue on headphones. Triangle formed by thin golden light lines connecting three objects. Scattered sticky notes, coffee cup, pencil in negative space. Color grading: Kodak Vision3 500T, deep navy shadows, warm amber overlaps. Film grain ISO 640. Volumetric light beams from above with distinct colors. Aspect ratio 16:9. Reference: David Fincher meticulous overhead compositions meets Wes Anderson symmetrical framing. 8K photorealistic.",
        },
    ],

    # ─── S11: ECC Everything Claude Code (3 張) ───
    "s11": [
        {
            "file": "s11/cover.png",
            "desc": "封面：深夜辦公桌上的綠色終端機光芒",
            "prompt": "Shot on ARRI Alexa Mini LF with Cooke S7i 50mm, T1.4. A single glowing terminal screen in a dark home office at 3AM, casting emerald-green light onto scattered handwritten notes, coffee cup with residue ring, and keyboard. The terminal shows scrolling code as bright green text on black. Window behind shows city lights completely out of focus as circular bokeh. Visible steam rising from the coffee cup catching the green backlight. Color grading: Kodak Vision3 500T 5219 pushed one stop — deep teal shadows, burnt amber from distant city lights in window. Film grain ISO 800 visible at 100%. Anamorphic oval bokeh from city lights. Chromatic aberration at frame edges. Aspect ratio 16:9. Reference: David Fincher The Social Network late-night coding aesthetic meets Sofia Coppola Lost in Translation insomnia intimacy meets Roger Deakins Blade Runner 2049 neon glow. 8K photorealistic.",
        },
        {
            "file": "s11/learning.png",
            "desc": "持續學習：大樹年輪截面特寫",
            "prompt": "Shot on Sony Venice 2 with Cooke Anamorphic 75mm, T2.3. Extreme macro shot of a cross-section of an ancient tree trunk showing detailed growth rings. Each ring has slightly different color tone representing years of growth. Warm amber side lighting from the left revealing texture of each ring with incredible detail. Visible resin droplets catching light as specular bright points. Bark texture at the edges showing deep fissures and moss. A single beam of light illuminating the center rings with volumetric dust particles. Color grading: Kodak Ektachrome 100D, warm amber tones, rich wood browns. Film grain ISO 200. Shallow depth of field with center rings sharp. Caustic light patterns refracted through resin. Aspect ratio 16:9. Reference: Terrence Malick Tree of Life organic naturalism meets Andrei Tarkovsky Stalker surreal details. 8K photorealistic.",
        },
        {
            "file": "s11/evolution.png",
            "desc": "進化：從簡單到複雜的螺旋結構",
            "prompt": "Shot on ARRI Alexa 65 with Zeiss Supreme Prime 24mm, T2.0. A beautiful nautilus shell cross-section floating in dark water, lit from behind by soft teal-green light revealing the perfect fibonacci spiral chambers. Each chamber progressively larger and more complex. Volumetric light scattering through the translucent shell walls. Tiny air bubbles suspended around the shell catching light as bright specular points. Dark navy-black water background. Color grading: Fujifilm Provia emulation — electric teal highlights, deep navy shadows. Film grain ISO 400. Caustic light patterns from water surface projected onto the shell. Aspect ratio 16:9. Reference: Denis Villeneuve Arrival sense of alien geometry meets Christopher Nolan Interstellar fifth dimension beauty. 8K photorealistic.",
        },
    ],

    # ─── S12: PAI Personal AI Infrastructure (3 張) ───
    "s12": [
        {
            "file": "s12/cover.png",
            "desc": "封面：一個人站在巨大伺服器機房中",
            "prompt": "Shot on ARRI Alexa 65 with Panavision Ultra Vista 24mm, T2.8. A solitary person standing at the center of a massive server room corridor, viewed from behind. Rows of server racks extend symmetrically to a vanishing point on both sides, lit by cool blue LED strips along the floor and warm amber status lights on servers. The person wears casual clothes contrasting with the industrial scale. Volumetric cold mist at floor level from cooling systems. Color grading: Fujifilm Provia pushed two stops — electric blue shadows, warm amber server lights, steel gray midtones. Film grain ISO 400. The corridor has a slight atmospheric haze giving depth. Aspect ratio 16:9. Reference: Christopher Nolan Interstellar architectural grandeur meets Roger Deakins Blade Runner 2049 vast interiors meets Stanley Kubrick 2001 Space Odyssey symmetry. 8K photorealistic.",
        },
        {
            "file": "s12/layers.png",
            "desc": "三層架構：從地面到雲端的三層平台",
            "prompt": "Shot on ARRI Alexa Mini LF with Zeiss Supreme Prime 35mm, T2.0. A surreal three-tiered floating platform structure in a vast dark space. Bottom tier is ground level with warm earthy amber lighting and concrete texture. Middle tier floats above with neutral white architectural lighting and glass surfaces. Top tier reaches into clouds with cool ethereal blue-white light and transparent crystalline materials. Thin golden light beams connect the three tiers like pillars. A small human figure stands on the bottom tier looking up. Volumetric mist between layers. Color grading: Vittorio Storaro color theory — warm ground, neutral middle, cool sky. Kodak Vision3 500T. Film grain ISO 500. Aspect ratio 16:9. Reference: Christopher Nolan Inception layered architecture meets Denis Villeneuve Arrival alien structure. 8K photorealistic.",
        },
        {
            "file": "s12/mirror.png",
            "desc": "TELOS：古老鏡子反射數位介面",
            "prompt": "Shot on ARRI Alexa Mini LF with Cooke S7i 40mm, T1.4. An ornate antique mirror in a dark room, its gilded frame showing patina and age. The reflection shows a faint holographic digital interface with floating text and data visualizations in cool teal-blue light, while the real side shows the warm amber of candlelight. A person's silhouette is partially visible at the mirror's edge. The contrast between analog warmth and digital coolness creates a color temperature boundary at the mirror surface. Visible fingerprints on the mirror glass catching both light sources. Color grading: Kodak Vision3 500T — deep warm shadows on real side, cool teal in reflection. Film grain ISO 640. Anamorphic oval bokeh from candle flames. Aspect ratio 16:9. Reference: Wong Kar-wai In the Mood for Love emotional distance meets Park Chan-wook color-coded psychological states meets Tarkovsky Mirror surreal reflection. 8K photorealistic.",
        },
    ],

    # ─── S13: GAS Google Apps Script (3 張) ───
    "s13": [
        {
            "file": "s13/cover.png",
            "desc": "封面：多米諾骨牌連鎖倒下的瞬間",
            "prompt": "Shot on RED V-Raptor 8K with Zeiss Supreme Prime 50mm, T1.5. Dramatic close-up of white domino tiles mid-cascade, frozen in the moment of falling. The first domino has a subtle Google-colors gradient (blue, red, yellow, green) painted on it. Each subsequent domino catching the warm amber spotlight as it falls, creating a wave of light. Dark background with single dramatic key light from upper left. Visible motion blur on the falling tiles while standing tiles remain sharp. Polished black surface reflecting the dominoes. Dust particles kicked up by the impact visible in the light beam. Color grading: Fujifilm Eterna Vivid 500D — olive shadows, peach highlights. Film grain ISO 500. Shallow depth of field. Aspect ratio 16:9. Reference: David Fincher meticulous slow-motion meets Christopher Nolan Tenet time-manipulation aesthetic. 8K photorealistic.",
        },
        {
            "file": "s13/clockwork.png",
            "desc": "時間觸發器：精密齒輪機械鐘內部",
            "prompt": "Shot on Sony Venice 2 with Cooke Anamorphic 75mm, T2.3. Interior macro shot of an antique clockwork mechanism with interlocking brass and steel gears in motion. Warm side lighting at 2800K from a single source revealing copper patina, specular highlights on polished gear teeth, and fine scratches from decades of use. The main spring coil visible in the background, slightly out of focus. Tiny dust particles suspended between gears catching the warm light. Color grading: Kodak Ektachrome 100 VS — saturated warm brass, deep shadow pockets between gears. Film grain ISO 200. Anamorphic horizontal lens flare from bright gear edge reflection. Caustic light patterns from reflective brass surfaces. Aspect ratio 16:9. Reference: Tarkovsky Stalker obsessive mechanical detail meets Barry Jenkins Moonlight warm intimate close-ups. 8K photorealistic.",
        },
        {
            "file": "s13/automation.png",
            "desc": "自動化流水線：傳送帶上的信封和文件",
            "prompt": "Shot on ARRI Alexa Mini with Angenieux Optimo 28-76mm at 40mm, T2.8. A miniature conveyor belt system in a warmly lit workshop, carrying tiny paper envelopes and documents from one station to another. Each station has a small mechanical arm or stamp that processes the document. Warm amber overhead lighting with cool blue accent lights on the mechanical parts. The conveyor belt has a polished metal surface reflecting the overhead lights. Tilt-shift effect making it look like a miniature world. Steam or light mist in the background. Color grading: Kodak Vision3 250D — balanced warm tones, gentle contrast. Film grain ISO 250. Shallow depth of field emphasizing the center conveyor. Aspect ratio 16:9. Reference: Wes Anderson Grand Budapest Hotel whimsical mechanical precision meets Jean-Pierre Jeunet Amelie warm miniature world. 8K photorealistic.",
        },
    ],

    # ─── S14: gws Google Workspace CLI (2 張) ───
    "s14": [
        {
            "file": "s14/cover.png",
            "desc": "封面：多螢幕控制台操作員",
            "prompt": "Shot on ARRI Alexa 65 with Zeiss Supreme Prime 24mm, T2.0. A single operator sitting before an array of six monitors in a dark control room, each screen showing different Google service interfaces casting colored light — Gmail red, Drive blue, Sheets green, Calendar purple, Docs white, Chat teal. The operator is seen from behind, silhouetted against the screens. The desk surface reflects all the screen colors in a rainbow pattern. Low ambient blue LED strip lighting along the floor. Coffee cup and notepad on the desk catching mixed colored light. Color grading: Kodak Vision3 500T — deep shadows, screen-lit faces of equipment. Film grain ISO 640. Anamorphic oval bokeh from distant indicator lights. Aspect ratio 16:9. Reference: David Fincher Gone Girl surveillance aesthetic meets Tony Scott Enemy of the State control room tension. 8K photorealistic.",
        },
        {
            "file": "s14/unified.png",
            "desc": "統一入口：多條河流匯入一條大河",
            "prompt": "Shot on ARRI Alexa Mini LF with Cooke S7i 24mm, T2.8. Aerial overhead shot of multiple small streams in different colors (blue, green, amber, teal, red) converging into a single powerful river in a dark forested landscape at golden hour. Each stream carries a subtle different color tint reflecting the sky. The convergence point creates beautiful swirling color mixing patterns. Dense forest on both banks with autumn foliage catching golden sunlight. Morning mist hanging over the water surface. Color grading: Fujifilm Eterna Vivid 500D — rich earth tones, golden highlights on water. Film grain ISO 500. Halated warm highlights where streams catch sunlight. Aspect ratio 16:9. Reference: Emmanuel Lubezki The Revenant aerial river shots meets Terrence Malick nature poetry. 8K photorealistic.",
        },
    ],

    # ─── S15: gcloud Google Cloud SDK (2 張) ───
    "s15": [
        {
            "file": "s15/cover.png",
            "desc": "封面：雲端基礎設施的壯觀視角",
            "prompt": "Shot on ARRI Alexa 65 with Panavision Ultra Vista 24mm, T2.8. A vast futuristic data center interior stretching to infinity, shot from low angle looking up through multiple transparent glass floors. Each floor level has different colored ambient lighting — bottom warm amber, middle teal-green, top cool blue. Fiber optic cables run vertically between floors like glowing vines. A single elevator capsule moves between levels with a warm interior light. The ceiling is open to a cloud-covered sky with light breaking through. Color grading: Fujifilm Provia pushed one stop — electric highlights, deep architectural shadows. Film grain ISO 400. Volumetric light beams from the sky opening. Aspect ratio 16:9. Reference: Christopher Nolan Interstellar tesseract scene meets Ridley Scott Blade Runner industrial cathedral. 8K photorealistic.",
        },
        {
            "file": "s15/auth.png",
            "desc": "認證：金色鑰匙插入鎖孔的瞬間",
            "prompt": "Shot on Sony Venice 2 with Cooke Anamorphic 50mm, T2.3. Extreme close-up of an ornate golden key being inserted into a complex mechanical lock. The key has intricate geometric patterns etched into its surface. The lock mechanism is partially visible through a cut-away, showing gears and pins. Warm amber side lighting creates dramatic shadows in the keyhole. Specular highlights on the polished key surface. Dark stone wall background with visible texture. A single thin teal-colored light beam escaping from inside the lock. Color grading: Kodak Ektachrome 100 VS — rich gold and amber tones. Film grain ISO 200. Anamorphic horizontal flare from key reflection. Aspect ratio 16:9. Reference: David Fincher Zodiac precision meets Park Chan-wook Oldboy detail obsession. 8K photorealistic.",
        },
    ],

    # ─── 既有 S01-S09 改版封面 (9 張) ───
    "s01": [
        {
            "file": "s01/cover.png",
            "desc": "S01 GAS 自動化：工廠自動化產線俯瞰",
            "prompt": "Shot on ARRI Alexa 65 with Panavision Ultra Vista 28mm, T2.8. Overhead view of a beautiful automated assembly line in a pristine factory, with robotic arms moving in synchronized choreography. Each station emits a different colored task light — warm amber for welding, cool blue for inspection, teal-green for packaging. The products flowing on the conveyor belt are miniature Google Sheets spreadsheets and Gmail envelopes as physical objects. Polished concrete floor reflecting the lights. Steam rising from processing stations. Color grading: Fujifilm Eterna Vivid 500D. Film grain ISO 400. Aspect ratio 16:9. Reference: Wes Anderson symmetrical factory meets Ridley Scott Blade Runner industrial beauty. 8K photorealistic.",
        },
    ],
    "s02": [
        {
            "file": "s02/cover.png",
            "desc": "S02 Vibe Coding：音樂視覺化+程式碼混合",
            "prompt": "Shot on ARRI Alexa Mini LF with Cooke S7i 35mm, T1.4. A musician at a grand piano in a dark concert hall, but instead of sheet music, holographic code floats above the piano in teal-green light. The piano keys emit warm amber light when pressed, sending up particle waves that transform into lines of code. The musician is in profile, backlit by a single dramatic spotlight. Visible sound waves rippling through the air as golden light streaks. Color grading: Kodak Vision3 500T pushed one stop — deep teal shadows, warm amber highlights from piano. Film grain ISO 640. Volumetric light beams from the spotlight. Anamorphic oval bokeh from distant hall lights. Aspect ratio 16:9. Reference: Damien Chazelle Whiplash musical intensity meets Denis Villeneuve Arrival alien language beauty. 8K photorealistic.",
        },
    ],
    "s03": [
        {
            "file": "s03/cover.png",
            "desc": "S03 CLI Agent：終端機中的 AI 代理人",
            "prompt": "Shot on ARRI Alexa 65 with Zeiss Supreme Prime 35mm, T2.0. A massive holographic terminal interface floating in a dark void, showing cascading green command-line text. A translucent humanoid figure made of light particles stands inside the terminal, reaching out to interact with floating file system nodes. The nodes glow in different colors: teal for directories, gold for files, cyan for processes. Digital particle trails follow the figure's hand movements. Color grading: Fujifilm Provia pushed two stops — electric teal, deep void black, golden accent highlights. Film grain ISO 500. Volumetric data particles floating in space. Aspect ratio 16:9. Reference: Denis Villeneuve Blade Runner 2049 hologram scene meets Spike Jonze Her digital consciousness. 8K photorealistic.",
        },
    ],
    "s04": [
        {
            "file": "s04/cover.png",
            "desc": "S04 VSCode IDE：程式編輯器的沈浸式工作空間",
            "prompt": "Shot on ARRI Alexa Mini LF with Cooke S7i 24mm, T2.0. A developer sitting in a dark room completely surrounded by floating code panels arranged in a semicircle, like a futuristic cockpit. Each panel shows different programming languages in distinct colors — Python in teal, JavaScript in gold, HTML in cyan. The developer's face is partially lit by the warm glow of the center panel. A coffee cup floats nearby in zero gravity. The room has a subtle grid pattern on the dark walls. Color grading: Kodak Vision3 500T — deep navy shadows, code-lit teal highlights. Film grain ISO 640. Multiple anamorphic bokeh points from floating code characters. Aspect ratio 16:9. Reference: Christopher Nolan Interstellar cockpit scenes meets The Matrix code rain aesthetic. 8K photorealistic.",
        },
    ],
    "s05": [
        {
            "file": "s05/cover.png",
            "desc": "S05 OpenClaw：開源的龍蝦爪夾娃娃機",
            "prompt": "Shot on RED V-Raptor 8K with Zeiss Supreme Prime 50mm, T1.5. A beautifully lit arcade claw machine in a dark game room, but instead of stuffed toys, it contains glowing AI model cubes in different colors — teal for open-source, gold for premium, red for restricted. The claw is descending toward a teal-colored cube labeled with a small code bracket symbol. Colorful LED lights frame the glass case. Reflections on the glass create dreamy bokeh layers. A child's hand reaches for the joystick at the bottom. Color grading: Fujifilm Eterna Vivid 500D — vivid neon colors, dark moody background. Film grain ISO 500. Anamorphic oval bokeh from arcade lights. Aspect ratio 16:9. Reference: Wong Kar-wai neon-drenched nightlife meets Wes Anderson symmetrical compositions. 8K photorealistic.",
        },
    ],
    "s06": [
        {
            "file": "s06/cover.png",
            "desc": "S06 Token Economy：金幣和代幣的流動",
            "prompt": "Shot on ARRI Alexa 65 with Panavision Ultra Vista 35mm, T2.0. A stream of glowing golden tokens flowing through a transparent glass pipeline system, like a modern Rube Goldberg machine. Some tokens are large and bright, others small and dim — representing different token costs. The pipeline branches into multiple paths, each labeled with floating holographic text. Background is dark with selective warm amber lighting on the glass pipes. Visible refraction and caustic light patterns through the glass. The tokens leave golden light trails as they flow. Color grading: Kodak Ektachrome 100D cross-processed — warm gold dominant, cool blue in shadows. Film grain ISO 400. Volumetric scattering where tokens cluster. Aspect ratio 16:9. Reference: Christopher Nolan Inception impossible architecture meets Charlie Kaufman intricate systems. 8K photorealistic.",
        },
    ],
    "s07": [
        {
            "file": "s07/cover.png",
            "desc": "S07 NotebookLM：筆記本變身有聲書",
            "prompt": "Shot on ARRI Alexa Mini LF with Cooke S7i 50mm, T1.4. An open leather-bound notebook on a dark wooden desk, but from its pages, sound waves are visually emerging as golden light ribbons that curl upward and transform into two ghostly figures in conversation. The notebook is lit by a warm reading lamp from the left. The sound wave figures are translucent, made of particle light in teal and amber tones. Visible text on the notebook pages in elegant handwriting. An old microphone sits beside the notebook. Dust particles floating in the lamp light. Color grading: Kodak Vision3 500T — warm amber reading light, cool teal for the holographic figures. Film grain ISO 500. Anamorphic oval bokeh from background bookshelf. Aspect ratio 16:9. Reference: Terrence Malick ethereal light poetry meets Spike Jonze Her digital-analog boundary. 8K photorealistic.",
        },
    ],
    "s08": [
        {
            "file": "s08/cover.png",
            "desc": "S08 81K Voices：八萬一千個聲音的回聲",
            "prompt": "Shot on ARRI Alexa 65 with Zeiss Supreme Prime 24mm, T2.8. A vast dark amphitheater seen from the stage perspective, with 81,000 seats stretching into darkness. Each seat has a tiny warm light, creating a galaxy of stars in the audience shape. A single microphone stands at center stage, lit by a dramatic overhead spotlight. Sound wave visualizations ripple outward from the microphone in concentric teal-colored light rings expanding into the audience. The architecture shows classical columns with modern digital overlays. Color grading: Kodak Vision3 500T pushed one stop — deep theatrical shadows, warm spotlight pool, teal sound ripples. Film grain ISO 800. Volumetric spotlight beam with visible dust. Aspect ratio 16:9. Reference: Janusz Kaminski Schindler List dramatic spotlight meets Denis Villeneuve Arrival vast scale. 8K photorealistic.",
        },
    ],
    "s09": [
        {
            "file": "s09/cover.png",
            "desc": "S09 FARS FactCheck：真相與謊言的天平",
            "prompt": "Shot on ARRI Alexa Mini LF with Cooke S7i 40mm, T2.0. An ornate antique balance scale on a dark marble surface, with one side holding a glowing teal crystal sphere representing truth, the other holding a crumbling dark red sphere representing misinformation. The teal sphere casts clean bright light downward, while the red sphere casts chaotic scattered shadows. The scale tips toward the teal side. A magnifying glass lies nearby catching and focusing the teal light into a beam. Dark dramatic background with a single shaft of light from above. Color grading: Kodak Ektachrome 100D — strong color contrast between teal truth and red falsehood. Film grain ISO 300. Caustic light from the magnifying glass. Specular highlights on the polished brass scale. Aspect ratio 16:9. Reference: Vittorio Storaro The Conformist symbolic color theory meets David Fincher Zodiac investigative precision. 8K photorealistic.",
        },
    ],
}


def check_status():
    """檢查哪些圖已生成、哪些缺失"""
    total = 0
    done = 0
    missing = []
    for unit, images in sorted(IMAGES.items()):
        for img in images:
            total += 1
            path = IMG_BASE / img["file"]
            if path.exists() and path.stat().st_size > 1000:
                done += 1
            else:
                missing.append(f"  {img['file']:30s} — {img['desc']}")
    print(f"\n📊 狀態：{done}/{total} 張已完成\n")
    if missing:
        print(f"❌ 缺少 {len(missing)} 張：")
        for m in missing:
            print(m)
    else:
        print("✅ 全部完成！")
    return missing


def main():
    parser = argparse.ArgumentParser(description="Cinematic image generation queue")
    parser.add_argument("--unit", help="只生某個單元 (e.g. s10)")
    parser.add_argument("--check", action="store_true", help="只檢查狀態")
    parser.add_argument("--dry-run", action="store_true", help="只顯示 prompt 不生圖")
    parser.add_argument("--provider", default="gemini_image", help="Provider: gemini_image, auto")
    args = parser.parse_args()

    if args.check:
        check_status()
        return

    # 篩選要生的圖
    units = {args.unit: IMAGES[args.unit]} if args.unit else IMAGES
    queue = []
    for unit, images in sorted(units.items()):
        for img in images:
            path = IMG_BASE / img["file"]
            if path.exists() and path.stat().st_size > 1000:
                continue  # 已存在，跳過
            queue.append(img)

    if not queue:
        print("✅ 所有圖片已存在，無需生成。")
        return

    print(f"\n🎬 Cinematic Image Queue: {len(queue)} 張待生成")
    print(f"   預估時間：{len(queue) * 1.5:.0f} - {len(queue) * 3:.0f} 分鐘\n")

    if args.dry_run:
        for i, img in enumerate(queue, 1):
            print(f"[{i}/{len(queue)}] {img['file']}")
            print(f"  描述: {img['desc']}")
            print(f"  Prompt: {img['prompt'][:120]}...")
            print()
        return

    # 逐張生成（串行，避免撞 rate limit）
    success = 0
    fail = 0
    start_time = time.time()

    for i, img in enumerate(queue, 1):
        path = str(IMG_BASE / img["file"])
        elapsed = time.time() - start_time
        eta = (elapsed / max(i - 1, 1)) * (len(queue) - i + 1) if i > 1 else 0
        print(f"[{i}/{len(queue)}] {img['desc']} (ETA: {eta/60:.1f}m)")

        ok = generate_image(img["prompt"], path, provider=args.provider)
        if ok:
            success += 1
        else:
            fail += 1

        # 間隔 5 秒避免 rate limit
        if i < len(queue):
            time.sleep(5)

    total_time = (time.time() - start_time) / 60
    print(f"\n{'='*50}")
    print(f"✅ 完成: {success} 張 | ❌ 失敗: {fail} 張 | 耗時: {total_time:.1f} 分鐘")
    check_status()


if __name__ == "__main__":
    main()
