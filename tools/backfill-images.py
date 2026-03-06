#!/usr/bin/env python3
"""AI 100 講 — 補圖工具

掃描 _posts/ 中缺少圖片的文章，用 AI Hub 生成背景圖 + PIL 疊加中文標題。
不使用 Pro model，不要求 Gemini 畫中文字。

用法:
  python3 tools/backfill-images.py                  # 補今天的
  python3 tools/backfill-images.py --date 2026-03-05 # 補指定日期
  python3 tools/backfill-images.py --all             # 補所有缺圖
  python3 tools/backfill-images.py --dry-run         # 只列出缺圖，不生成
"""

import argparse
import base64
import datetime
import glob
import logging
import os
import re
import subprocess
import sys
import time

try:
    import httpx
except ImportError:
    print("pip3 install httpx"); sys.exit(1)
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("pip3 install Pillow"); sys.exit(1)

# ============================================================
# 設定
# ============================================================

# 支援多站台
SITES = {
    "ai100": "/home/ac-mac/ai100",
    "s100":  "/home/ac-mac/sustainability-100",
}
DEFAULT_SITE = "ai100"
AI_HUB = os.environ.get("AI_HUB_URL", "http://127.0.0.1:8760")
FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"

# 用於從文章內容推斷圖片 prompt 的 LLM
LLM_SYSTEM = (
    "你是圖片描述專家。根據文章標題和內容，用英文寫一段 50 字以內的圖片場景描述，"
    "風格為專業科技新聞插圖，不需要包含文字。只回覆描述本身。"
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backfill")


# ============================================================
# 工具函數
# ============================================================

def find_missing(repo_dir: str, date_filter: str = None) -> list[dict]:
    """找出缺圖的文章。"""
    posts_dir = os.path.join(repo_dir, "_posts")
    img_dir = os.path.join(repo_dir, "assets", "images", "news")
    pattern = os.path.join(posts_dir, f"{date_filter}-*.md" if date_filter else "*.md")
    missing = []
    for md_path in sorted(glob.glob(pattern)):
        slug = os.path.basename(md_path).replace(".md", "")
        img_path = os.path.join(img_dir, f"{slug}.png")
        if os.path.exists(img_path):
            continue

        with open(md_path, encoding="utf-8") as f:
            content = f.read()

        # 解析 frontmatter
        title = ""
        summary = ""
        m = re.search(r'^title:\s*"?(.+?)"?\s*$', content, re.MULTILINE)
        if m:
            title = m.group(1)
        m = re.search(r'^summary:\s*"?(.+?)"?\s*$', content, re.MULTILINE)
        if m:
            summary = m.group(1)

        # 取正文 (frontmatter 後)
        parts = content.split("---", 2)
        body = parts[2].strip()[:500] if len(parts) > 2 else ""

        missing.append({
            "slug": slug,
            "title": title,
            "summary": summary,
            "body": body,
            "md_path": md_path,
        })
    return missing


def get_image_prompt(title: str, summary: str, body: str) -> str:
    """用 LLM 生成圖片 prompt。"""
    user_msg = f"標題: {title}\n摘要: {summary}\n內容: {body[:300]}"
    try:
        resp = httpx.post(
            f"{AI_HUB}/api/llm/chat",
            json={"prompt": user_msg, "system_prompt": LLM_SYSTEM, "provider": "auto"},
            timeout=60,
        )
        data = resp.json()
        if data.get("success"):
            return data.get("content", "") or data.get("message", "")
    except Exception as e:
        log.warning(f"LLM prompt 生成失敗: {e}")

    # Fallback: 用標題直接翻譯成簡單描述
    return f"Professional tech editorial illustration related to: {title}. Futuristic style with blue and cyan tones."


def generate_background(prompt: str) -> bytes | None:
    """生成背景圖 (不含中文字)。"""
    clean_prompt = (
        f"{prompt} "
        f"Professional tech editorial illustration style, cinematic lighting, "
        f"dark navy gradient background. No text, no watermarks, no logos."
    )
    try:
        resp = httpx.post(
            f"{AI_HUB}/api/image/generate",
            json={"prompt": clean_prompt, "timeout": 180},
            timeout=200,
        )
        data = resp.json()
        if data.get("success") and data.get("image_base64"):
            return base64.b64decode(data["image_base64"])
        else:
            log.warning(f"生圖失敗: {data.get('detail', data.get('message', ''))}")
    except Exception as e:
        log.warning(f"生圖異常: {e}")
    return None


def add_title_overlay(img_data: bytes, title: str) -> Image.Image:
    """PIL 疊加中文標題到圖片底部。"""
    from io import BytesIO
    img = Image.open(BytesIO(img_data)).convert("RGBA")
    if img.size != (1024, 1024):
        img = img.resize((1024, 1024), Image.LANCZOS)

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # 底部漸層暗色條
    bar_h = 200
    for i in range(bar_h):
        alpha = int(220 * (i / bar_h))
        y = img.height - bar_h + i
        draw.rectangle([(0, y), (img.width, y)], fill=(0, 0, 0, alpha))

    font = ImageFont.truetype(FONT_PATH, 42)

    # 自動換行
    lines = _wrap_title(title, font, img.width - 80)

    y_start = img.height - 50 - len(lines) * 55
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (img.width - tw) // 2
        y = y_start + i * 55
        # 陰影
        draw.text((x + 2, y + 2), line, fill=(0, 0, 0, 200), font=font)
        # 主文字
        draw.text((x, y), line, fill=(255, 255, 255, 240), font=font)

    return Image.alpha_composite(img, overlay).convert("RGB")


def _wrap_title(title: str, font, max_width: int) -> list[str]:
    """智慧換行：在標點或空格處斷行。"""
    if _text_width(title, font) <= max_width:
        return [title]

    # 嘗試在中間附近的斷點切割
    break_chars = " ，、的了是在與：，"
    mid = len(title) // 2
    best = mid
    for offset in range(len(title) // 2):
        for pos in [mid + offset, mid - offset]:
            if 0 <= pos < len(title) and title[pos] in break_chars:
                best = pos + 1
                break
        else:
            continue
        break

    line1 = title[:best].rstrip()
    line2 = title[best:].lstrip()

    # 如果兩行還是太長，強制在中間切
    if not line2:
        line1 = title[:mid]
        line2 = title[mid:]

    return [line1, line2]


def _text_width(text: str, font) -> int:
    bbox = font.getbbox(text)
    return bbox[2] - bbox[0]


def update_frontmatter(md_path: str, slug: str):
    """在 frontmatter 加入 image 欄位。"""
    with open(md_path, encoding="utf-8") as f:
        content = f.read()
    if "image:" in content:
        return
    date_str = slug[:10]
    content = content.replace(
        f"date: {date_str}",
        f"date: {date_str}\nimage: {slug}.png",
        1,
    )
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(content)


# ============================================================
# 主流程
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="AI 100 講 / 永續100講 補圖工具")
    parser.add_argument("--site", choices=["ai100", "s100", "all"], default="ai100",
                        help="站台: ai100, s100, all (預設 ai100)")
    parser.add_argument("--date", help="指定日期 (YYYY-MM-DD)")
    parser.add_argument("--all", action="store_true", help="補所有缺圖文章")
    parser.add_argument("--dry-run", action="store_true", help="只列出不生成")
    parser.add_argument("--no-push", action="store_true", help="不 git push")
    args = parser.parse_args()

    date_filter = None
    if args.date:
        date_filter = args.date
    elif not args.all:
        date_filter = datetime.date.today().isoformat()

    sites = list(SITES.items()) if args.site == "all" else [(args.site, SITES[args.site])]
    missing = []
    for site_name, repo_dir in sites:
        found = find_missing(repo_dir, date_filter)
        for a in found:
            a["site"] = site_name
            a["repo_dir"] = repo_dir
        missing.extend(found)
    if not missing:
        log.info("沒有缺圖文章")
        return

    log.info(f"找到 {len(missing)} 篇缺圖文章")
    for a in missing:
        log.info(f"  {a['slug']}: {a['title'][:40]}")

    if args.dry_run:
        return

    created_files = {}
    # group by repo for git push
    success = 0

    for i, article in enumerate(missing, 1):
        log.info(f"\n[{i}/{len(missing)}] {article['title'][:50]}")

        # 1. LLM 生成 prompt
        prompt = get_image_prompt(article["title"], article["summary"], article["body"])
        log.info(f"  prompt: {prompt[:80]}...")

        # 2. 生成背景圖 (不帶中文字)
        img_data = generate_background(prompt)
        if not img_data:
            log.error(f"  圖片生成失敗，跳過")
            continue

        # 3. PIL 疊加標題
        result = add_title_overlay(img_data, article["title"])
        img_dir = os.path.join(article["repo_dir"], "assets", "images", "news")
        os.makedirs(img_dir, exist_ok=True)
        out_path = os.path.join(img_dir, f"{article['slug']}.png")
        result.save(out_path, quality=92)
        size = os.path.getsize(out_path)
        log.info(f"  OK: {out_path} ({size:,} bytes)")

        # 4. 更新 frontmatter
        update_frontmatter(article["md_path"], article["slug"])
        repo = article["repo_dir"]
        if repo not in created_files:
            created_files[repo] = []
        created_files[repo].append(os.path.join("assets", "images", "news", f"{article['slug']}.png"))
        created_files[repo].append(os.path.join("_posts", f"{article['slug']}.md"))
        success += 1
        time.sleep(3)

    log.info(f"\n完成: {success}/{len(missing)}")

    # Git push (per repo)
    if created_files and not args.no_push:
        for repo_dir, files in created_files.items():
            try:
                os.chdir(repo_dir)
                subprocess.run(["git", "add"] + files, check=True, capture_output=True)
                today = datetime.date.today().isoformat()
                site_label = os.path.basename(repo_dir)
                msg = f"backfill: 補圖 {len(files)//2} 篇 ({site_label}, {date_filter or 'all'})"
                subprocess.run(["git", "commit", "-m", msg], check=True, capture_output=True)
                subprocess.run(["git", "push"], check=True, capture_output=True, timeout=120)
                log.info(f"Git push 完成: {site_label}")
            except Exception as e:
                log.warning(f"Git 操作失敗 ({site_label}): {e}")


if __name__ == "__main__":
    main()
