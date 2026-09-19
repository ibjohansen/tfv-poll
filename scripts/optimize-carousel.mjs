import { mkdir, readdir } from 'node:fs/promises';
import { extname, join, parse } from 'node:path';
import sharp from 'sharp';

const sourceDirectory = join(process.cwd(), 'public', 'carousel');
const outputDirectory = join(sourceDirectory, 'optimized');
const supported = new Set(['.jpg', '.jpeg', '.png']);

await mkdir(outputDirectory, { recursive: true });
const files = (await readdir(sourceDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && supported.has(extname(entry.name).toLowerCase()))
  .map((entry) => entry.name);

for (const filename of files) {
  const outputName = `${parse(filename).name}.webp`;
  await sharp(join(sourceDirectory, filename))
    .rotate()
    .resize({ width: 1920, height: 1280, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 68, effort: 5 })
    .toFile(join(outputDirectory, outputName));
}

console.log(`Generated ${files.length} optimized carousel images in public/carousel/optimized.`);
