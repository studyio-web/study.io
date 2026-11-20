const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = path.join(process.env.TEMP, 'chrome_cdp_premium_' + Date.now());

const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  'about:blank'
]);

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  await sleep(1500);

  async function capture(url, width, height, mobile, outPath, captureBeyondViewport = false) {
    const targetRes = await fetch(`http://127.0.0.1:9222/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const tab = await targetRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);

    let id = 1;
    const send = (method, params = {}) => new Promise((resolve) => {
      const curId = id++;
      const handler = (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

    await new Promise(res => { ws.onopen = res; });
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile
    });
    // Wait for Next.js hydration & images to load
    await sleep(2500);

    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport
    });
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    console.log(`Captured ${outPath} (${width}x${height}, beyond=${captureBeyondViewport})`);

    ws.close();
    await fetch(`http://127.0.0.1:9222/json/close/${tab.id}`);
  }

  const brainDir = 'C:\\Users\\Lenovo\\.gemini\\antigravity\\brain\\d25f5ab0-6e73-4883-acd2-57484a9b35f3';

  // 1. Desktop after (1280x1200)
  await capture('http://localhost:3000/premium', 1280, 1200, false, path.join(brainDir, 'desktop_premium_after.png'), false);

  // 2. Android 360 (360x800)
  await capture('http://localhost:3000/premium?native=1', 360, 800, true, path.join(brainDir, 'android_premium_360.png'), false);

  // 3. Android 412 (412x915)
  await capture('http://localhost:3000/premium?native=1', 412, 915, true, path.join(brainDir, 'android_premium_412.png'), false);

  // 4. Android 360 Full Page (all 6 sections + plan selector + cta)
  await capture('http://localhost:3000/premium?native=1', 360, 800, true, path.join(brainDir, 'android_premium_360_full.png'), true);

  chrome.kill();
  console.log('All screenshots captured successfully.');
  process.exit(0);
}

run().catch(err => {
  console.error('Error running capture:', err);
  try { chrome.kill(); } catch {}
  process.exit(1);
});
