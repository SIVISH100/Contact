// usage: node tools/split_text.js <outdir>
// Splits the brochure into (a) text-free page backgrounds and (b) a JSON list of text boxes
// (text, position, size, weight, colour, alignment) so the text can be rebuilt as editable text in Canva.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TEXT = [
  '.p1 .head h1', '.p1 .head .sub', '.p1 .intro p', '.p1 .adv h2', '.p1 .it h3', '.p1 .it p',
  '.p1 .band h2', '.p1 .need .n', '.p1 .need .cap', '.p1 .need .why p', '.p1 .need .tags span',
  '.p1 .gapl', '.p1 .gp h3', '.p1 .gp p',
  '.p2 .price h2', '.p2 .pc h3', '.p2 .pc p', '.p2 .plat h2', '.p2 .plat .lead', '.p2 .how h3.t',
  '.p2 .st h4', '.p2 .st p', '.p2 .road h3', '.p2 .ck', '.p2 .band h2', '.p2 .band p', '.p2 .btn',
];

(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.resolve('index.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  const boxes = await p.evaluate(sel => {
    const rgb = c => { const m = c.match(/\d+(\.\d+)?/g); return m ? '#' + m.slice(0, 3).map(v => (+v).toString(16).padStart(2, '0')).join('') : '#1d2d53'; };
    const res = [];
    document.querySelectorAll('.page').forEach((pg, pi) => {
      const pr = pg.getBoundingClientRect();
      sel.forEach(s => pg.querySelectorAll(s.replace(/^\.p[12] /, '')).forEach(el => {
        if (!pg.matches(s.split(' ')[0])) return;
        const cs = getComputedStyle(el), tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? 1 : 3 });
        const tn = []; while (tw.nextNode()) tn.push(tw.currentNode);
        if (!tn.length) return;
        const rg = document.createRange(); rg.setStart(tn[0], 0); rg.setEnd(tn[tn.length - 1], tn[tn.length - 1].length);
        const r = rg.getBoundingClientRect();
        let color = rgb(cs.color);
        // gradient-clipped text: use the brand blue (or white on the blue band)
        if (cs.webkitTextFillColor && cs.webkitTextFillColor.includes('0, 0, 0, 0') || cs.color.includes(', 0)')) color = el.closest('.band') ? '#ffffff' : '#1f9dd0';
        if (el.matches('.btn')) color = '#3b6cf0';
        const text = el.innerText.replace(/‑/g, '-').trim();
        if (!text) return;
        res.push({ page: pi + 1, sel: s, text, top: r.top - pr.top, left: r.left - pr.left, width: r.width, height: r.height,
          size: parseFloat(cs.fontSize), weight: +cs.fontWeight >= 600 ? 'bold' : 'normal', color,
          lineHeight: Math.round(parseFloat(cs.lineHeight) / parseFloat(cs.fontSize) * 100) / 100 || 1.3,
          align: cs.textAlign === 'center' ? 'center' : 'start' });
      }));
    });
    // hide the text, keep every box, pill, icon and image
    const st = document.createElement('style');
    st.textContent = sel.join(',') + `{color:transparent!important;-webkit-text-fill-color:transparent!important}
      ${sel.join(' *,')} *{color:transparent!important;-webkit-text-fill-color:transparent!important;background-image:none!important}
      .p1 .need .n,.p1 .head h1 em,.p2 .plat h2 em{background:none!important}
      .p2 .ck .ic,.p2 .ck .ic *{color:#fff!important}.p2 .btn .ic,.p2 .btn .ic *{color:#3b6cf0!important}`;
    document.head.appendChild(st);
    return res;
  }, TEXT);
  await p.waitForTimeout(200);
  const pages = await p.$$('.page');
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: `${out}/bg-page-${i + 1}.jpg`, type: 'jpeg', quality: 93 });
  fs.writeFileSync(`${out}/text-boxes.json`, JSON.stringify(boxes, null, 1));
  await b.close();
  console.log(boxes.length, 'text boxes');
})();
