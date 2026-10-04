export function revealLeafletLayerWithoutZoom(map, layer) {
  const bounds = layer?.getBounds?.();
  if (!map || !bounds?.isValid?.() || map.getBounds().intersects(bounds)) return false;
  map.panTo(bounds.getCenter(), { animate: false });
  return true;
}
