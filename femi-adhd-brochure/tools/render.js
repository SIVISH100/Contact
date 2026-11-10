// usage: node tools/render.js <outdir>  ->  page PNGs + Femi-ADHD-brochure.pdf (A4)
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const out = process.argv[2] || 'out';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.resolve('index.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(500);
  const pages = await p.$$('.page');
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: `${out}/page-${i + 1}.png` });
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: `${out}/Femi-ADHD-brochure.pdf`, preferCSSPageSize: true, printBackground: true });
  await b.close();
  console.log('pages', pages.length);
})();
