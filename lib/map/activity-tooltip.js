export function activityTooltipContent(feature, detail = '', imageCreditLabel = '') {
  const content = document.createElement('div');
  content.className = 'activity-map-tooltip-content';
  if (feature.imageUrl) {
    const image = document.createElement('img');
    image.className = 'activity-map-tooltip-image';
    image.src = feature.imageUrl;
    image.alt = feature.name;
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    if (imageCreditLabel) {
      const frame = document.createElement('figure');
      frame.className = 'activity-map-tooltip-image-frame';
      const credit = document.createElement('figcaption');
      credit.className = 'activity-image-credit';
      credit.textContent = imageCreditLabel;
      image.addEventListener('error', () => frame.remove(), { once: true });
      frame.append(image, credit);
      content.append(frame);
    } else {
      image.addEventListener('error', () => image.remove(), { once: true });
      content.append(image);
    }
  }
  const name = document.createElement('strong');
  name.textContent = feature.name;
  content.append(name);
  if (detail) {
    const metadata = document.createElement('div');
    metadata.textContent = detail;
    content.append(metadata);
  }
  if (feature.tooltipText) {
    const description = document.createElement('p');
    description.textContent = feature.tooltipText;
    content.append(description);
  }
  return content;
}
