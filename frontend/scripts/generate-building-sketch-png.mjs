import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const svgTemplate = fs.readFileSync(path.join(publicDir, 'building-sketch.svg'), 'utf8');

function svgWithStroke(strokeColor) {
  return svgTemplate.replace(/stroke="currentColor"/g, `stroke="${strokeColor}"`);
}

async function writePng(filename, strokeColor, width = 1560, height = 840) {
  const svg = svgWithStroke(strokeColor);
  await sharp(Buffer.from(svg))
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(publicDir, filename));
  console.log(`Wrote ${filename}`);
}

await writePng('building-sketch-dark.png', '#ffffff');
await writePng('building-sketch-light.png', '#1a2744');
