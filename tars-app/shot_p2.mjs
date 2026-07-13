import puppeteer from 'puppeteer-core';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860 });
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('err ' + m.text()); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:5180/', { waitUntil: 'domcontentloaded', timeout: 45000 });
await wait(11000);
// advance a couple steps for content
for (let i = 0; i < 2; i++) { await page.evaluate(() => document.querySelectorAll('.ord .confirm').forEach((b) => b.click())); await wait(400); await page.evaluate(() => { const b = document.getElementById('nextBtn'); if (b && !b.disabled) b.click(); }); await wait(1000); }
// expand BOTH notches to reveal stat + gauge
await page.evaluate(() => { document.getElementById('agentCaret')?.click(); document.getElementById('humanCaret')?.click(); });
await wait(900);
let pB = await page.$('#panelB');
await pB.screenshot({ path: 'shot-p2-expanded.png' });
// dark mode
await page.evaluate(() => document.getElementById('p2Dark')?.click());
await wait(900);
pB = await page.$('#panelB');
await pB.screenshot({ path: 'shot-p2-dark.png' });
console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
console.log('done');
