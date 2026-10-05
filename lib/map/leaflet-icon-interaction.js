export const ACTIVITY_ICON_TOOLTIP_DELAY_MS = 500;

export function bindActivityIconInteraction({ marker, map, tooltip, onSelect, delay = ACTIVITY_ICON_TOOLTIP_DELAY_MS }) {
  let tooltipTimer = null;

  function cancelTooltipTimer() {
    if (tooltipTimer === null) return;
    clearTimeout(tooltipTimer);
    tooltipTimer = null;
  }

  function closeTooltip() {
    cancelTooltipTimer();
    map.closeTooltip(tooltip);
  }

  function scheduleTooltip() {
    cancelTooltipTimer();
    tooltipTimer = setTimeout(() => {
      tooltipTimer = null;
      tooltip.setLatLng(marker.getLatLng()).openOn(map);
    }, delay);
  }

  marker.on('mouseover focus', scheduleTooltip);
  marker.on('mouseout blur', closeTooltip);
  marker.on('click', () => {
    closeTooltip();
    onSelect();
  });
  marker.on('remove', closeTooltip);
  return marker;
}
