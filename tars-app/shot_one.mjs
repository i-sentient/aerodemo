import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const layer = process.argv[2] || 'skeletal';
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
await wait(7000);
await page.evaluate(() => window.__tars.setMode('patient', 'ICU-04'));
await wait(18000);
if (layer !== 'skeletal') { await page.evaluate((l) => document.querySelector(`.layer-toggle button[data-l="${l}"]`)?.click(), layer); await wait(16000); }
await page.screenshot({ path: `shot-one-${layer}.png` });
console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
console.log('done', layer);
