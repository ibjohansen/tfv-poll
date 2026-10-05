export function activityTooltipContent(feature, detail = '') {
  const content = document.createElement('div');
  content.className = 'activity-map-tooltip-content';
  if (feature.imageUrl) {
    const image = document.createElement('img');
    image.className = 'activity-map-tooltip-image';
    image.src = feature.imageUrl;
    image.alt = feature.name;
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => image.remove(), { once: true });
    content.append(image);
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
