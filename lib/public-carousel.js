const CAROUSEL_FILENAME = /^(.+)_tf([1-9][0-9]*)\.(?:jpe?g|png|webp|avif)$/i;

export function parseCarouselFilename(filename) {
  const normalizedFilename = String(filename || '');
  const match = normalizedFilename.match(CAROUSEL_FILENAME);
  if (!match) return null;

  const photographer = match[1].replaceAll('_', ' ').replace(/\s+/g, ' ').trim();
  if (!photographer) return null;

  return {
    id: normalizedFilename,
    filename: normalizedFilename,
    photographer,
    number: Number.parseInt(match[2], 10),
    src: `/carousel/${normalizedFilename}`,
  };
}

export function carouselImagesFromFilenames(filenames) {
  return filenames
    .map(parseCarouselFilename)
    .filter(Boolean)
    .sort((left, right) => left.number - right.number
      || left.filename.localeCompare(right.filename, 'nb'));
}
