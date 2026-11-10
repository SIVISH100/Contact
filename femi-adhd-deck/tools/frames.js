// usage: node tools/frames.js <outdir> <slideNumber(1-based)> <ms,ms,...>
// Captures the live (animated) deck at given times after entering a slide.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [out, n, times] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + path.resolve('index.html') + '#' + n);
  const t0 = Date.now();
  for (const ms of times.split(',').map(Number)) {
    await p.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
    await p.screenshot({ path: `${out}/live-${n}-${ms}.png` });
  }
  await b.close();
})();
