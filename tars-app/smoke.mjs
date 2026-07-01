import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5180/';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errs = [];
page.on('pageerror', (e) => errs.push(`[PAGEERROR] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(`[console.error] ${m.text()}`); });

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 20000 });
await new Promise((r) => setTimeout(r, 1500));

const modeName = () => page.$eval('#modeName', (e) => e.textContent);
console.log('boot mode:', await modeName(), '| errors so far:', errs.length);

// force patient mode via the dev hook (clicking a 3D bed is unreliable headless)
await page.evaluate(() => window.__tars.setMode('patient', 'ICU-04'));
await new Promise((r) => setTimeout(r, 2200)); // transition + clip reveal + EMR render
// step the chat a few times to exercise agentic EMR navigation
for (let i = 0; i < 5; i++) { await page.evaluate(() => document.getElementById('nextBtn')?.click()); await new Promise((r) => setTimeout(r, 700)); }
await new Promise((r) => setTimeout(r, 800));

const state = await page.evaluate(() => ({
  mode: document.getElementById('modeName').textContent,
  emrPresent: !!document.querySelector('.emr'),
  railItems: document.querySelectorAll('.emr-rail .ri').length,
  activeSection: document.querySelector('.emr-rail .ri.on')?.textContent?.trim(),
  agentCaret: !!document.querySelector('.agent-caret'),
  dock: document.getElementById('dock').childElementCount,
  chatMsgs: document.getElementById('chat').childElementCount,
}));
console.log('after click:', JSON.stringify(state));
console.log('ERRORS:', errs.length ? '\n' + errs.join('\n') : 'none');
await browser.close();
