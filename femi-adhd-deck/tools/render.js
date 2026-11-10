// usage: node tools/render.js <outdir>
// Renders print mode (final animation states): one PNG per slide + the submission PDF.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || 'out', v = process.argv[3] || 'a';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.resolve('index.html') + '?print=1&v=' + v);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(900);
  const slides = await p.$$('.slide');
  for (let i = 0; i < slides.length; i++) {
    await slides[i].screenshot({ path: `${out}/${v}-slide-${String(i).padStart(2, '0')}.png` });
  }
  await p.pdf({ path: `${out}/Femi-ADHD-deck.pdf`, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
  await b.close();
  console.log('rendered', slides.length);
})();
