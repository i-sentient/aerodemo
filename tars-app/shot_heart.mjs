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
await wait(10000);
await page.evaluate(() => window.__tars.setMode('patient', 'ICU-04'));
await wait(6000);
// switch to vascular; wait for heavy Draco decode
await page.evaluate(() => document.querySelector('.layer-toggle button[data-l="vascular"]')?.click());
await wait(18000);
let pA = await page.$('#panelA');
await pA.screenshot({ path: 'shot-heart-vascular.png' });
// zoom into the heart (force convergence — headless throttles rAF mid-transition)
await page.evaluate(() => document.querySelector('.heart-zoom')?.click());
await wait(2500);
await page.evaluate(() => window.__snapCam());
await wait(1500);
pA = await page.$('#panelA');
await pA.screenshot({ path: 'shot-heart-zoom.png' });

console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
console.log('done');
