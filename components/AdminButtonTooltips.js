'use client';

import { useEffect } from 'react';

const explanations = new Map([
  ['Logg ut', 'Logg ut av administrasjonen.'],
  ['Lukk', 'Lukk detaljpanelet.'],
  ['Søk', 'Bruk valgte filtre og søketeksten.'],
  ['Hent adresser', 'Hent offisielle adressepunkter innenfor søkepolygonet.'],
  ['Hent veier og stier', 'Hent og beregn veier og stier innenfor søkepolygonet.'],
  ['Hent eiendomsgrenser', 'Hent tilgjengelige eiendomsgrenser innenfor søkepolygonet.'],
  ['Sammenlign register', 'Sammenlign medlemsregisteret med de offisielle adressene i området.'],
  ['Last grendelisten på nytt', 'Hent lagrede grender fra databasen på nytt.'],
  ['Ny grend', 'Vis feltene for å opprette og lagre en ny grend.'],
]);

function addTooltip(element) {
  if (element.title) return;
  const label = element.dataset.tooltip || element.getAttribute('aria-label') || element.textContent?.replace(/\s+/g, ' ').trim();
  if (!label) return;
  element.title = explanations.get(label) || `Utfør handlingen «${label}».`;
}

export default function AdminButtonTooltips() {
  useEffect(() => {
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
  }, []);
  return null;
}
