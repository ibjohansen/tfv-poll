import { getServerI18n } from '@/lib/i18n/server';

export async function adminPageMetadata(titleKey) {
  const { t } = await getServerI18n('admin.common');
  return {
    title: `${t(titleKey)} | ${t('memberService')}`,
    robots: { index: false, follow: false },
  };
}
