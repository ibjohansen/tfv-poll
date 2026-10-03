'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';
import { locateProperty, propertyMapUrl, PROPERTY_MAP_PLACE } from '@/lib/map/property-browser-client';

export default function MemberPropertyMap({ streetAddress }) {
  const { t } = useI18n('members.propertyMap');
  const [enabled, setEnabled] = useState(false);
  const [result, setResult] = useState(null);
  const coordinates = result?.address === streetAddress ? result.coordinates : undefined;

  useEffect(() => {
    if (!enabled || !streetAddress) return;
    const controller = new AbortController();
    locateProperty(streetAddress, controller.signal)
      .then((coordinates) => { if (!controller.signal.aborted) setResult({ address: streetAddress, coordinates }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ address: streetAddress, coordinates: null }); });
    return () => controller.abort();
  }, [enabled, streetAddress]);

  if (!streetAddress) return null;
  return <details className="member-map" onToggle={(event) => { if (event.currentTarget.open) setEnabled(true); }}>
    <summary className="member-map-heading">
      <div><strong>{t('title')}</strong><span>{streetAddress}, {PROPERTY_MAP_PLACE}</span></div>
      <span className="member-map-toggle" aria-hidden="true">{t('show')}</span>
    </summary>
    {enabled && <div className="member-map-content">
      <p>{t('privacy')}</p>
      {coordinates === undefined ? <div className="member-map-loading" role="status">{t('loading')}</div>
        : <iframe className="member-map-frame" src={propertyMapUrl(streetAddress, coordinates)}
          title={t('frameTitle', { address: streetAddress })} loading="lazy" referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin" allowFullScreen />}
      <a className="member-map-source" href={propertyMapUrl(streetAddress, coordinates)} target="_blank" rel="noreferrer">{t('open')}</a>
    </div>}
  </details>;
}
