import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const sourcePath = path.join(publicDir, 'chabad-bedford-logo-source.png');

function applyTransparentBackground(data, channels) {
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

    if (luminance >= 245) {
      data[i + 3] = 0;
      continue;
    }

    if (luminance >= 225) {
      data[i + 3] = Math.round(((245 - luminance) / 20) * 255);
    }
  }
}

async function main() {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.from(data);
  applyTransparentBackground(rgba, info.channels);

  const pngPath = path.join(publicDir, 'chabad-bedford-logo.png');
  const meta = await sharp(rgba, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 12 })
    .png()
    .toFile(pngPath);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${meta.width} ${meta.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Chabad of Bedford">
  <title>Chabad of Bedford</title>
  <image width="${meta.width}" height="${meta.height}" href="/chabad-bedford-logo.png" xlink:href="/chabad-bedford-logo.png" />
</svg>`;

  fs.writeFileSync(path.join(publicDir, 'chabad-bedford-logo.svg'), svg, 'utf8');
  console.log(`Logo PNG: ${meta.width}x${meta.height}`);
  console.log('Wrote chabad-bedford-logo.png and chabad-bedford-logo.svg');
}

await main();
