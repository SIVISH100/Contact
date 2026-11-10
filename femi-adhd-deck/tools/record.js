// usage: node tools/record.js <outdir> "<slide>:<seconds>,<slide>:<seconds>,..."
// Records the live (animated) deck walking through the given slides (1-based) into one video.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [out, plan] = process.argv.slice(2);
  const steps = plan.split(',').map(s => s.split(':').map(Number));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: out, size: { width: 1920, height: 1080 } } });
  const p = await ctx.newPage();
  await p.goto('file://' + path.resolve('index.html') + '#' + steps[0][0]);
  await p.addStyleTag({ content: '.hud{display:none!important}' });
  await p.waitForTimeout(steps[0][1] * 1000);
  for (const [n, sec] of steps.slice(1)) {
    await p.evaluate(n => { location.hash = '#' + n; }, n);
    await p.reload();
    await p.addStyleTag({ content: '.hud{display:none!important}' });
    await p.waitForTimeout(sec * 1000);
  }
  const v = await p.video().path();
  await ctx.close(); await b.close();
  console.log(v);
})();
