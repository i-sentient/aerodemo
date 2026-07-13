import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('console.error ' + m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await wait(12000);

// advance the scripted chat n times; confirm any pending gated order at the
// START of each iteration so the LAST gated chip stays visible (pulsing).
async function step(n) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => document.querySelectorAll('.ord .confirm').forEach((b) => b.click()));
    await wait(500);
    await page.evaluate(() => { const b = document.getElementById('nextBtn'); if (b && !b.disabled) b.click(); });
    await wait(1000);
  }
}

// 1) FLOOR — default aqua ambient
await step(4);
let pB = await page.$('#panelB');
await pB.screenshot({ path: 'shot-aero-floor.png' });
await page.screenshot({ path: 'shot-aero-full.png' });

// 2) PATIENT ICU-04 — critical STEMI → core/ambient turn red
await page.evaluate(() => window.__tars.setMode('patient', 'ICU-04'));
await wait(2500);
await step(4);
pB = await page.$('#panelB');
await pB.screenshot({ path: 'shot-aero-patient.png' });

console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
console.log('done');
