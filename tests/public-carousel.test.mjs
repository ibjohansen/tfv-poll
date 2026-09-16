import assert from 'node:assert/strict';
import test from 'node:test';
import { carouselImagesFromFilenames, parseCarouselFilename } from '../lib/public-carousel.js';

test('carousel filename exposes the photographer and a safe public URL', () => {
  assert.deepEqual(parseCarouselFilename('Ib Johansen_tf4.jpeg'), {
    id: 'Ib Johansen_tf4.jpeg',
    filename: 'Ib Johansen_tf4.jpeg',
    photographer: 'Ib Johansen',
    number: 4,
    src: '/carousel/Ib Johansen_tf4.jpeg',
  });
  assert.equal(parseCarouselFilename('forsidebilde.jpg'), null);
});

test('carousel images are filtered and sorted by the numeric tf suffix', () => {
  const images = carouselImagesFromFilenames([
    'Kari_Nordmann_tf10.webp',
    '.DS_Store',
    'Ola Nordmann_tf2.jpg',
    'Kari_Nordmann_tf1.png',
    'Kari_Nordmann_tf0.jpg',
  ]);

  assert.deepEqual(images.map(({ photographer, number }) => ({ photographer, number })), [
    { photographer: 'Kari Nordmann', number: 1 },
    { photographer: 'Ola Nordmann', number: 2 },
    { photographer: 'Kari Nordmann', number: 10 },
  ]);
});
