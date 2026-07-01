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
const clickLayer = (l) => page.evaluate((l) => { const b = document.querySelector(`.layer-toggle button[data-l="${l}"]`); if (b) b.click(); }, l);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await wait(8000);
await page.evaluate(() => window.__tars.setMode('patient', 'ICU-04'));
await wait(20000);                       // skeletal
await page.screenshot({ path: 'shot-skeletal.png' });
await clickLayer('vascular');
await wait(20000);                       // vascular (1.1MB)
await page.screenshot({ path: 'shot-vascular.png' });
await clickLayer('nervous');
await wait(28000);                       // nervous (3.2MB, dense brain)
await page.screenshot({ path: 'shot-nervous.png' });
console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
console.log('done');
