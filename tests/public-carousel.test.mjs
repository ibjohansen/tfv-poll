import assert from 'node:assert/strict';
import test from 'node:test';
import { carouselImagesFromFilenames, parseCarouselFilename } from '../lib/public-carousel.js';
import { isPublicPath } from '../lib/route-access.js';

test('carousel filename exposes the photographer and a safe public URL', () => {
  assert.deepEqual(parseCarouselFilename('Ib Johansen_tf4.jpeg'), {
    id: 'Ib Johansen_tf4.jpeg',
    filename: 'Ib Johansen_tf4.jpeg',
    photographer: 'Ib Johansen',
    number: 4,
    src: '/carousel/Ib%20Johansen_tf4.jpeg',
  });
  assert.equal(parseCarouselFilename('forsidebilde.jpg'), null);
  assert.equal(parseCarouselFilename('Bjørn Normann jr_tf000.jpg').number, 0);
  assert.equal(parseCarouselFilename('Bjørn Normann jr_tf000.jpg').src, '/carousel/Bj%C3%B8rn%20Normann%20jr_tf000.jpg');
  assert.equal(parseCarouselFilename('Anne-May Enger_tf001.jpg').number, 1);
  assert.equal(isPublicPath(parseCarouselFilename('Bjørn Normann jr_tf000.jpg').src), true);
  assert.equal(isPublicPath(parseCarouselFilename('Anne-May Enger_tf001.jpg').src), true);
  assert.equal(isPublicPath('/carousel/private.txt'), false);
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
    { photographer: 'Kari Nordmann', number: 0 },
    { photographer: 'Kari Nordmann', number: 1 },
    { photographer: 'Ola Nordmann', number: 2 },
    { photographer: 'Kari Nordmann', number: 10 },
  ]);
});
