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
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await new Promise((r) => setTimeout(r, 20000));    // headless Draco decode is slow
await page.screenshot({ path: 'shot-floor.png' });
await page.evaluate(() => window.__tars.setMode('patient', 'ICU-04'));
await new Promise((r) => setTimeout(r, 18000));
await page.screenshot({ path: 'shot-patient.png' });
console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
console.log('saved shot-floor.png');
await browser.close();
