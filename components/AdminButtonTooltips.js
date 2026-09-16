'use client';

import { useEffect } from 'react';
import { useI18n } from '@/components/LocaleProvider';

export default function AdminButtonTooltips() {
  const { t } = useI18n();
  useEffect(() => {
    const explanations = new Map([
      [t('admin.common.logout'), t('general.tooltips.logout')],
      [t('general.actions.close'), t('general.tooltips.close')],
      [t('general.actions.search'), t('general.tooltips.search')],
      [t('map.admin.fetchAddresses'), t('general.tooltips.fetchAddresses')],
      [t('map.admin.fetchRoads'), t('general.tooltips.fetchRoads')],
      [t('map.admin.fetchBoundaries'), t('general.tooltips.fetchBoundaries')],
      [t('map.admin.compare'), t('general.tooltips.compare')],
      [t('map.admin.hamlets.reload'), t('general.tooltips.reloadHamlets')],
      [t('map.admin.hamlets.new'), t('general.tooltips.newHamlet')],
    ]);
    const addTooltip = (element) => {
      if (element.title) return;
      const label = element.dataset.tooltip || element.getAttribute('aria-label') || element.textContent?.replace(/\s+/g, ' ').trim();
      if (label) element.title = explanations.get(label) || t('general.tooltips.generic', {label});
    };
    const selector = 'button, a.admin-button, a.primary-button, label.admin-button';
    const update = (root = document) => {
      if (root.matches?.(selector)) addTooltip(root);
      root.querySelectorAll?.(selector).forEach(addTooltip);
    };
    update();
    const observer = new MutationObserver((entries) => entries.forEach((entry) => entry.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) update(node);
    })));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [t]);
  return null;
}
