// usage: node tools/capture.js <outdir> [fps]
// Frame-exact capture of every slide's entrance animation (live mode, ?cap):
// the GSAP timeline is paused and seeked frame by frame, so nothing is dropped.
// Writes <outdir>/sNN/f00001.jpg ... and <outdir>/durations.json
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
(async () => {
  const out = process.argv[2], fps = +(process.argv[3] || 30), HOLD = 0.8;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const base = 'file://' + path.resolve('index.html') + '?cap=1';
  await p.goto(base + '&s=0#1');
  await p.waitForFunction(() => window.__tl);
  const n = await p.evaluate(() => document.querySelectorAll('.slide').length);
  const durations = {};
  for (let s = 1; s <= n; s++) {
    await p.goto(base + '&s=' + s + '#' + s);
    await p.waitForFunction(() => window.__tl && document.fonts.status === 'loaded');
    await p.waitForTimeout(300);
    const d = await p.evaluate(() => { window.__tl.pause(0); return window.__tl.duration(); });
    const total = Math.ceil((d + HOLD) * fps), dir = `${out}/s${String(s).padStart(2, '0')}`;
    fs.mkdirSync(dir, { recursive: true });
    for (let f = 0; f < total; f++) {
      await p.evaluate(t => { window.__tl.time(Math.min(t, window.__tl.duration()), false); }, f / fps);
      await p.screenshot({ path: `${dir}/f${String(f + 1).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    }
    durations[s] = total / fps;
    console.log('slide', s, 'frames', total);
  }
  fs.writeFileSync(`${out}/durations.json`, JSON.stringify(durations, null, 1));
  await b.close();
})();
