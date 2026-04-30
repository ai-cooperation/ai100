/**
 * HTML Slides → PDF Converter
 *
 * Usage:
 *   node scripts/html-to-pdf.js all        # Convert all slides
 *   node scripts/html-to-pdf.js changed    # Convert only changed slides (git diff)
 *   node scripts/html-to-pdf.js S01_GAS_Automation  # Convert specific slide
 *
 * Output: slides/pdf/{name}.pdf
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SLIDES_DIR = path.join(__dirname, '..', 'slides', 'supplements');
const PDF_DIR = path.join(__dirname, '..', 'slides', 'pdf');

async function getSlideList(mode) {
  const allFiles = fs.readdirSync(SLIDES_DIR)
    .filter(f => f.endsWith('.html') && !f.includes('_v2_'));

  if (mode === 'all') {
    return allFiles;
  }

  if (mode === 'changed') {
    try {
      const diff = execSync('git diff --name-only HEAD~1 HEAD -- slides/supplements/*.html', { encoding: 'utf8' });
      const changed = diff.trim().split('\n')
        .filter(Boolean)
        .map(f => path.basename(f));
      return changed.length > 0 ? changed : allFiles;
    } catch {
      return allFiles;
    }
  }

  // Specific slide name
  const match = allFiles.find(f => f.startsWith(mode));
  return match ? [match] : [];
}

async function convertToPdf(browser, htmlFile) {
  const name = path.basename(htmlFile, '.html');
  const htmlPath = path.join(SLIDES_DIR, htmlFile);
  const pdfPath = path.join(PDF_DIR, name + '.pdf');

  console.log(`  Converting: ${htmlFile}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  // Hide UI overlays (chapter menu, page indicator, controls) so they don't appear in PDF
  await page.evaluateOnNewDocument(() => {
    const style = document.createElement('style');
    style.textContent = '.chapter-menu,.slide-counter,.controls,.brand-footer,.progress{display:none !important;}';
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });

  // Load the HTML slide
  const fileUrl = 'file://' + path.resolve(htmlPath);
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for fonts to load
  await page.evaluate(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 1000));

  // Find total slides — support both .slide and .s class naming
  const { totalSlides, slideSelector, fragmentSelector, activeClass } = await page.evaluate(() => {
    const dotSlide = document.querySelectorAll('.slide').length;
    const dotS = document.querySelectorAll('.s').length;
    if (dotSlide > 0) return { totalSlides: dotSlide, slideSelector: '.slide', fragmentSelector: '.fragment', activeClass: 'active' };
    if (dotS > 0) return { totalSlides: dotS, slideSelector: '.s', fragmentSelector: '.f', activeClass: 'on' };
    return { totalSlides: 0, slideSelector: null, fragmentSelector: null, activeClass: null };
  });
  console.log(`  Found ${totalSlides} slides (${slideSelector || 'none'})`);

  if (totalSlides === 0) {
    console.log(`  Skipping: no slide elements found`);
    await page.close();
    return false;
  }

  // Capture each slide as a separate page in the PDF
  // Strategy: activate each slide, screenshot, combine
  const screenshots = [];

  for (let i = 0; i < totalSlides; i++) {
    await page.evaluate((idx, sel, fragSel, actCls) => {
      // Deactivate all slides
      document.querySelectorAll(sel).forEach(s => {
        s.classList.remove(actCls);
        s.style.opacity = '0';
        s.style.transform = 'none';
        s.style.pointerEvents = 'none';
      });
      // Activate target slide
      const target = document.querySelectorAll(sel)[idx];
      if (target) {
        target.classList.add(actCls);
        target.style.opacity = '1';
        target.style.transform = 'none';
        target.style.pointerEvents = 'auto';
        // Reveal ALL fragments so PDF captures full content
        const visCls = fragSel === '.f' ? 'v' : 'visible';
        target.querySelectorAll(fragSel).forEach(f => {
          f.classList.add(visCls);
          f.style.opacity = '1';
          f.style.transform = 'none';
        });
      }
    }, i, slideSelector, fragmentSelector, activeClass);

    await new Promise(r => setTimeout(r, 300));

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: 1920, height: 1080 }
    });
    screenshots.push(screenshot);
  }

  // Create PDF from screenshots using a new page
  const pdfPage = await browser.newPage();

  // Build HTML with all slide images
  const imgTags = screenshots.map((buf, i) => {
    const b64 = buf.toString('base64');
    return `<div class="page"><img src="data:image/png;base64,${b64}"></div>`;
  }).join('\n');

  const pdfHtml = `<!DOCTYPE html>
<html><head><style>
  @page { size: 1920px 1080px; margin: 0; }
  * { margin: 0; padding: 0; }
  .page { width: 1920px; height: 1080px; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: avoid; }
  img { width: 100%; height: 100%; object-fit: contain; }
</style></head><body>${imgTags}</body></html>`;

  await pdfPage.setContent(pdfHtml, { waitUntil: 'load' });
  await pdfPage.pdf({
    path: pdfPath,
    width: '1920px',
    height: '1080px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });

  await pdfPage.close();
  await page.close();

  const size = (fs.statSync(pdfPath).size / 1024 / 1024).toFixed(1);
  console.log(`  ✅ ${name}.pdf (${totalSlides} pages, ${size} MB)`);
  return true;
}

async function main() {
  const mode = process.argv[2] || 'all';
  console.log(`📄 HTML → PDF Converter (mode: ${mode})`);

  // Ensure output dir exists
  fs.mkdirSync(PDF_DIR, { recursive: true });

  const files = await getSlideList(mode);
  if (files.length === 0) {
    console.log('No slides to convert.');
    return;
  }

  console.log(`Converting ${files.length} slides...`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  let success = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const ok = await convertToPdf(browser, file);
      if (ok) success++;
    } catch (err) {
      console.error(`  ❌ ${file}: ${err.message}`);
      failed++;
    }
  }

  await browser.close();
  console.log(`\nDone: ${success} converted, ${failed} failed`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
