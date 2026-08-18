/**
 * Responsive screenshot harness.
 *
 * Captures a page at every viewport that matters, so layout changes can be
 * reviewed side by side instead of by resizing a window one width at a time.
 *
 * The viewport list is deliberately built from BOUNDARY PAIRS (1439/1440,
 * 1535/1536, ...) rather than round numbers. Breakpoint bugs live at the
 * boundary — a size that looks fine at 1400 and fine at 1500 can still break at
 * 1439 vs 1440 — and a single-width sweep walks straight past them.
 *
 * Usage:
 *   npm run dev                       # in another terminal
 *   node scripts/shoot.mjs                          # hero, all viewports
 *   node scripts/shoot.mjs --out=after              # write to .shots/after
 *   node scripts/shoot.mjs --path=/gps --full       # other page, full height
 *   node scripts/shoot.mjs --only=1440,1536         # just these widths
 *
 * Output goes to site/.shots/<label>/ (gitignored).
 */

import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { chromium } from "@playwright/test"

/**
 * Viewports to capture. `h` is the BROWSER VIEWPORT height, not the display
 * height — roughly display minus ~110px of macOS menu bar and browser chrome.
 * That distinction matters here because the hero art is 2.04:1 and its height
 * is what overflows short viewports.
 */
const VIEWPORTS = [
  { w: 402, h: 780, note: "iPhone 17" },
  { w: 768, h: 900, note: "iPad portrait" },
  { w: 1023, h: 700, note: "below lg" },
  { w: 1024, h: 700, note: "lg boundary" },
  { w: 1151, h: 700, note: "below old lg (1152)" },
  { w: 1152, h: 700, note: "old lg boundary" },
  { w: 1279, h: 800, note: "below xl (default)" },
  { w: 1280, h: 800, note: "xl boundary (default)" },
  { w: 1366, h: 660, note: "#3 global resolution" },
  { w: 1439, h: 790, note: "below old xl (1440)" },
  { w: 1440, h: 790, note: '13" MacBook / old xl boundary' },
  { w: 1535, h: 840, note: "below 2xl (default)" },
  { w: 1536, h: 750, note: "#2 global resolution" },
  { w: 1600, h: 900, note: "mid-large" },
  { w: 1727, h: 1000, note: "below old 2xl (1728)" },
  { w: 1728, h: 1000, note: "old 2xl boundary" },
  { w: 1786, h: 1046, note: "reported: art too large" },
  { w: 1919, h: 950, note: "below 1920" },
  { w: 1920, h: 950, note: "#1 global resolution" },
  { w: 2100, h: 1250, note: "reviewer display" },
  { w: 2880, h: 1780, note: "native-res display" },
]

/** Short/tall pair at the 832px height gate, to isolate height-driven changes. */
const HEIGHT_PAIRS = [
  { w: 1600, h: 831, note: "height gate: short" },
  { w: 1600, h: 832, note: "height gate: tall" },
]

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split("=").slice(1).join("=") : fallback
}
const has = (name) => process.argv.includes(`--${name}`)

const BASE = arg("base", "https://localhost:3000")
const PAGE_PATH = arg("path", "/")
const LABEL = arg("out", "current")
const FULL = has("full")
const only = arg("only")
const onlyWidths = only ? new Set(only.split(",").map(Number)) : null

const outDir = path.resolve(process.cwd(), ".shots", LABEL)

/**
 * Measured geometry, pulled from the live DOM rather than computed from the
 * stylesheet. Numbers derived by hand from CSS have been wrong in this codebase
 * before (rem values silently resolve against a 112.5% root above 640px), so
 * the harness reports what the browser actually did.
 */
function measure() {
  const px = (n) => Math.round(n * 10) / 10
  const hero = document.querySelector("#hero")
  const h1 = hero?.querySelector("h1")
  const art = hero?.querySelector("picture.relative")
  const grid = hero?.querySelector(":scope > div")
  const inner = hero?.firstElementChild
  const cs = (el, p) => (el ? getComputedStyle(el)[p] : null)

  const gridCS = grid ? getComputedStyle(grid) : null
  const artBox = art?.getBoundingClientRect()
  const h1Box = h1?.getBoundingClientRect()
  const heroBox = hero?.getBoundingClientRect()

  return {
    root: cs(document.documentElement, "fontSize"),
    heroH: heroBox ? px(heroBox.height) : null,
    viewportH: window.innerHeight,
    heroPctOfViewport: heroBox
      ? Math.round((heroBox.height / window.innerHeight) * 100)
      : null,
    container: inner ? px(inner.getBoundingClientRect().width) : null,
    gridCols: gridCS?.gridTemplateColumns ?? "(not grid)",
    gridGap: gridCS?.columnGap ?? null,
    headlineFs: cs(h1, "fontSize"),
    headlineLines:
      h1 && h1Box
        ? Math.round(h1Box.height / parseFloat(getComputedStyle(h1).lineHeight))
        : null,
    headlineW: h1Box ? px(h1Box.width) : null,
    artW: artBox ? px(artBox.width) : null,
    artH: artBox ? px(artBox.height) : null,
    artPctOfHero: artBox && heroBox ? Math.round((artBox.height / heroBox.height) * 100) : null,
    /** Horizontal gap between the art's right edge and the headline's left. */
    artToTextGap:
      artBox && h1Box ? px(h1Box.left - (artBox.left + artBox.width)) : null,
    /** Does anything overflow horizontally? Non-zero means a scrollbar. */
    overflowX: px(
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    ),
  }
}

/**
 * Ad-hoc viewports: --vp=1757x1137,1757x1250
 * Useful for reproducing a specific reported window, where the HEIGHT is often
 * the variable that matters and is the one people don't think to report.
 */
const adHoc = (arg("vp") ?? "")
  .split(",")
  .filter(Boolean)
  .map((s) => {
    const [w, h] = s.split("x").map(Number)
    return { w, h, note: "ad-hoc" }
  })

const targets = adHoc.length
  ? adHoc
  : [...VIEWPORTS, ...HEIGHT_PAIRS].filter(
      (v) => !onlyWidths || onlyWidths.has(v.w)
    )

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

// ignoreHTTPSErrors: the dev server uses a mkcert pair whose root CA lives in
// the system keychain, which Playwright's bundled Chromium does not consult.
const browser = await chromium.launch()
const rows = []

for (const v of targets) {
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h },
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
    reducedMotion: "reduce", // freeze entry animations so shots are stable
    colorScheme: "light",
  })
  const page = await ctx.newPage()
  const url = `${BASE}${PAGE_PATH}`
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 45000 })
  } catch {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 })
  }
  await page.waitForTimeout(400)

  const m = await page.evaluate(measure)
  rows.push({ ...v, ...m })

  const name = `${String(v.w).padStart(4, "0")}x${v.h}.png`
  await page.screenshot({ path: path.join(outDir, name), fullPage: FULL })
  await ctx.close()

  console.log(
    `${String(v.w).padStart(4)}x${String(v.h).padEnd(5)} ` +
      `root=${String(m.root).padEnd(6)} hero=${String(m.heroH).padEnd(7)}` +
      `(${String(m.heroPctOfViewport).padStart(3)}% vp) ` +
      `h1=${String(m.headlineFs).padEnd(7)}${String(m.headlineLines)}L ` +
      `art=${String(m.artW).padEnd(6)}x${String(m.artH).padEnd(7)}` +
      `(${String(m.artPctOfHero).padStart(3)}% hero) ` +
      `gap=${String(m.artToTextGap).padEnd(7)} ` +
      `ovf=${m.overflowX}  ${v.note}`
  )
}

await browser.close()
await writeFile(
  path.join(outDir, "measurements.json"),
  JSON.stringify(rows, null, 2)
)
console.log(`\n${rows.length} shots -> ${outDir}`)
