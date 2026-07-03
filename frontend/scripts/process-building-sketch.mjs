import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const sourcePath = path.join(publicDir, 'building_sketch-source.png');

function applyTransparentBackground(data, width, height, channels) {
  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);

    // White / near-white background → fully transparent
    if (min >= 248) {
      data[i + 3] = 0;
      continue;
    }

    // Soft alpha for anti-aliased edges on white bg
    let alpha = 255 - max;
    if (max > 210) {
      alpha = Math.round(((255 - max) / 45) * 255);
    } else {
      alpha = Math.min(255, Math.round(alpha * 1.15));
    }

    data[i + 3] = Math.max(0, Math.min(255, alpha));
  }
}

function invertLineColors(data, channels) {
  for (let i = 0; i < data.length; i += channels) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
}

async function processImage() {
  const { data, info } = await sharp(sourcePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgba = Buffer.from(data);
  applyTransparentBackground(rgba, info.width, info.height, info.channels);

  const lightOut = path.join(publicDir, 'building_sketch-transparent.png');
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 10 })
    .png()
    .toFile(lightOut);

  const trimmedMeta = await sharp(lightOut).metadata();
  console.log(`Wrote ${lightOut} (${trimmedMeta.width}x${trimmedMeta.height})`);

  const darkRgba = Buffer.from(rgba);
  invertLineColors(darkRgba, 4);
  const darkOut = path.join(publicDir, 'building_sketch-dark.png');
  await sharp(darkRgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ threshold: 10 })
    .png()
    .toFile(darkOut);
  console.log(`Wrote ${darkOut} (${trimmedMeta.width}x${trimmedMeta.height})`);

  fs.copyFileSync(lightOut, path.join(publicDir, 'building_sketch.png'));
  fs.unlinkSync(lightOut);
  console.log('Updated building_sketch.png');
}

await processImage();
