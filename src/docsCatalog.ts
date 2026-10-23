export const englishDocSlugs: Record<string, string> = {
  '统一登录与静默续期-2026-09-30': 'unified-login-and-silent-renewal',
  'subapp接入文档1': 'subapp-integration',
  'OAuth接入与外部注册说明': 'oauth-and-external-registration',
  '测试身份适配指南': 'test-identity-integration',
  'api用量限制app接入指南': 'api-usage-limits',
  '接入错误经验总结': 'integration-troubleshooting',
};

export function translatedDocSlug(slug: string, language: 'en' | 'zh'): string {
  if (language === 'en') return englishDocSlugs[slug] || slug;
  return Object.entries(englishDocSlugs).find(([, english]) => english === slug)?.[0] || slug;
}
