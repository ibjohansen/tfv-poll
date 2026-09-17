'use client';

import Select from "@/components/Select";
import { useI18n } from './LocaleProvider';

export default function LanguageSwitcher() {
  const { locale, t } = useI18n('general.language');

  function change(event) {
    if (event.target.value !== locale) event.currentTarget.form.requestSubmit();
  }

  return <form className="language-switcher" method="get">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21M12 3C9.6 5.5 8.4 8.5 8.4 12s1.2 6.5 3.6 9" /></svg>
    <label><span className="visually-hidden">{t('label')}</span><Select name="lang" defaultValue={locale} onChange={change} aria-label={t('label')}>
      <option value="nb">{t('nb')}</option><option value="en">{t('en')}</option>
    </Select></label>
  </form>;
}
