const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/xiagu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
const source = `data:image/png;base64,${fs.readFileSync(path.join(root, 'assets/branding/bajiao-rain-headphones.png')).toString('base64')}`;
const background = '#173F43';

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  try {
    const page = await browser.newPage({deviceScaleFactor: 1});
    async function render(size, file, adaptive = false) {
      await page.setViewportSize({width: size, height: size});
      await page.setContent(`<style>html,body{margin:0}canvas{display:block}</style><canvas width="${size}" height="${size}"></canvas>`);
      await page.evaluate(async ({source, size, adaptive}) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const context = document.querySelector('canvas').getContext('2d');
        context.imageSmoothingQuality = 'high';
        if (!adaptive) {
          context.drawImage(image, 0, 0, size, size);
          return;
        }
        // Android exposes the middle 72dp of a 108dp adaptive canvas.
        // Keep the complete composition there; extend edge pixels only into
        // the outer motion allowance so masks never reveal empty corners.
        const inset = size / 6;
        const visible = size * 2 / 3;
        const sx = [0, 0, image.width - 1];
        const sy = [0, 0, image.height - 1];
        const sw = [1, image.width, 1];
        const sh = [1, image.height, 1];
        const positions = [0, inset, inset + visible];
        const lengths = [inset, visible, inset];
        for (let y = 0; y < 3; y++) {
          for (let x = 0; x < 3; x++) {
            context.drawImage(image, sx[x], sy[y], sw[x], sh[y],
              positions[x], positions[y], lengths[x], lengths[y]);
          }
        }
      }, {source, size, adaptive});
      await page.screenshot({path: path.join(root, file)});
    }
    await render(1024, 'assets/branding/bajiao-master.png');
    await render(512, 'app/src/main/res/drawable-nodpi/bajiao_icon.png');
    await render(432, 'app/src/main/res/drawable-nodpi/bajiao_icon_adaptive.png', true);
    fs.writeFileSync(path.join(root, 'app/src/main/res/values/colors.xml'), `<resources>\n    <color name="bajiao_icon_background">${background}</color>\n</resources>\n`);
    // Preview the 72dp viewport of the 108dp adaptive canvas at launcher sizes.
    const adaptiveImage = fs.readFileSync(path.join(root, 'app/src/main/res/drawable-nodpi/bajiao_icon_adaptive.png')).toString('base64');
    await page.setViewportSize({width: 820, height: 360});
    await page.setContent(`<style>body{margin:0;background:#F8F7F2;display:flex;align-items:center;justify-content:center;gap:36px;height:360px;font:12px sans-serif;color:#526157}.item{text-align:center}.icon{position:relative;background:${background};overflow:hidden;margin-bottom:16px}.icon img{position:absolute;width:150%;height:150%;left:-25%;top:-25%;display:block}</style>` +
      [[220,'50%','圆形'],[220,'24%','圆角'],[64,'50%','64 px'],[48,'50%','48 px']].map(([size,radius,label]) => `<div class="item"><div class="icon" style="width:${size}px;height:${size}px;border-radius:${radius}"><img src="data:image/png;base64,${adaptiveImage}"></div>${label}</div>`).join(''));
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    fs.mkdirSync(path.join(root, 'artifacts'), {recursive:true});
    await page.screenshot({path: path.join(root, 'artifacts/bajiao-rain-icon-preview.png')});
    console.log('Exported selected rain/headphones artwork, launcher PNGs, adaptive canvas and mask previews.');
  } finally {
    await browser.close();
  }
})().catch(error => {console.error(error); process.exitCode = 1;});
