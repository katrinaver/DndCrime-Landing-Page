#!/usr/bin/env node

import { chromium } from 'playwright-core'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const viewports = [
  { name: 'desktop', width: 1280, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 2 },
]

function args() {
  const result = {}
  for (let i = 2; i < process.argv.length; i += 1) {
    const key = process.argv[i]
    if (key.startsWith('--')) result[key.slice(2)] = process.argv[++i]
  }
  return result
}

function pad(source, width, height) {
  if (source.width === width && source.height === height) return source
  const target = new PNG({ width, height })
  target.data.fill(255)
  PNG.bitblt(source, target, 0, 0, source.width, source.height, 0, 0)
  return target
}

async function screenshot(browser, base, out, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    reducedMotion: 'reduce',
  })
  // Canvas-эффекты используют Math.random(). Одинаковый seed для production
  // и staging делает начальное расположение частиц воспроизводимым.
  await context.addInitScript(() => {
    let state = 0x2f6e2b1
    Math.random = () => {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      return (state >>> 0) / 0x1_0000_0000
    }
  })
  const page = await context.newPage()
  // Clock управляет performance.now/requestAnimationFrame. Сначала ставим
  // страницу на паузу, затем вручную проигрываем одинаковое число кадров.
  const clockStart = new Date('2026-01-01T00:00:00.000Z')
  await page.clock.install({ time: clockStart })
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1))
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  })
  await page.clock.runFor(1000)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.clock.runFor(1000)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.clock.runFor(1000)
  await page.screenshot({ path: out, fullPage: true })
  await context.close()
}

async function makeDiff(baselinePath, currentPath, diffPath) {
  const baseline = PNG.sync.read(await readFile(baselinePath))
  const current = PNG.sync.read(await readFile(currentPath))
  const width = Math.max(baseline.width, current.width)
  const height = Math.max(baseline.height, current.height)
  const before = pad(baseline, width, height)
  const after = pad(current, width, height)
  const diff = new PNG({ width, height })
  const matchOptions = {
    // Canvas anti-aliasing can differ by a few RGB levels between two
    // otherwise identical Chromium contexts. Ignore that raster noise while
    // retaining actual geometry/colour changes.
    threshold: 0.4,
    alpha: 0.5,
    includeAA: false,
    diffColor: [255, 0, 0],
  }
  let changed = pixelmatch(before.data, after.data, diff.data, width, height, matchOptions)
  // Headless Chromium can leave a handful of GPU-rasterized canvas pixels
  // different even with identical seeds and clocks. Below 0.005% the signal
  // is not visually meaningful, so produce a clean zero diff.
  if ((changed / (width * height)) * 100 < 0.005) {
    changed = 0
    pixelmatch(before.data, before.data, diff.data, width, height, matchOptions)
  }
  await writeFile(diffPath, PNG.sync.write(diff))
  return {
    before,
    after,
    percentage: ((changed / (width * height)) * 100).toFixed(3),
  }
}

function sliderHtml(viewport) {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DndCrime ${viewport}: production / PR</title>
<style>
body{margin:0;background:#14110d;color:#efe6d4;font:14px system-ui,sans-serif}header{padding:14px 20px;border-bottom:1px solid #594929}h1{margin:0;font-size:16px}.compare{position:relative;max-width:100%;margin:auto;cursor:ew-resize;user-select:none;touch-action:none}.compare img{display:block;width:100%;height:auto}.current{position:absolute;inset:0 auto auto 0;clip-path:inset(0 0 0 50%)}.divider{position:absolute;top:0;bottom:0;left:50%;width:3px;background:#d8b268;transform:translateX(-50%);pointer-events:none}.divider:after{content:'↔';position:absolute;top:50%;left:50%;display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#d8b268;color:#14110d;transform:translate(-50%,-50%)}.label{position:absolute;top:12px;padding:5px 9px;background:#14110dcc}.before{left:12px}.after{right:12px}
</style></head><body><header><h1>${viewport}: production / this PR</h1></header>
<div class="compare" id="compare"><img src="${viewport}--baseline.png" alt="production"><img class="current" id="current" src="${viewport}--current.png" alt="this PR"><div class="divider" id="divider"></div><span class="label before">production</span><span class="label after">this PR</span></div>
<script>const c=document.querySelector('#compare'),a=document.querySelector('#current'),d=document.querySelector('#divider');let drag=false;function move(e){const r=c.getBoundingClientRect(),x=e.touches?e.touches[0].clientX:e.clientX,p=Math.max(0,Math.min(100,(x-r.left)/r.width*100));a.style.clipPath='inset(0 0 0 '+p+'%)';d.style.left=p+'%';e.preventDefault()}c.addEventListener('pointerdown',e=>{drag=true;c.setPointerCapture(e.pointerId);move(e)});c.addEventListener('pointermove',e=>{if(drag)move(e)});c.addEventListener('pointerup',()=>drag=false);</script></body></html>`
}

async function main() {
  const options = args()
  if (!options.baseline || !options.current || !options.out) {
    throw new Error('usage: visual-diff --baseline <url> --current <url> --out <dir>')
  }
  await mkdir(options.out, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const report = []
  try {
    for (const viewport of viewports) {
      const baselinePath = join(options.out, `${viewport.name}--baseline.png`)
      const currentPath = join(options.out, `${viewport.name}--current.png`)
      const diffPath = join(options.out, `${viewport.name}--diff.png`)
      await screenshot(browser, options.baseline.replace(/\/$/, ''), baselinePath, viewport)
      await screenshot(browser, options.current.replace(/\/$/, ''), currentPath, viewport)
      const { before, after, percentage } = await makeDiff(baselinePath, currentPath, diffPath)
      await writeFile(baselinePath, PNG.sync.write(before))
      await writeFile(currentPath, PNG.sync.write(after))
      await writeFile(join(options.out, `${viewport.name}.html`), sliderHtml(viewport.name))
      report.push(`${viewport.name} ${percentage}`)
      console.log(`${viewport.name}: ${percentage}% changed`)
    }
  } finally {
    await browser.close()
  }
  await writeFile(join(options.out, 'report.txt'), `${report.join('\n')}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
