import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarDays, ChevronDown, Search, Shield } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle, useThemeMode } from './theme';
import { localizedDocsPath, preferredDocsLanguage, type DocsLanguage } from './seo';
import userGuide from '../docs/user-guide.md?raw';
import userGuideEnglish from '../docs/user-guide.en.md?raw';
import './docs.css';
import { translatedDocSlug } from './docsCatalog';

const sources = import.meta.glob('../Subapp-Docs子应用配置文档/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;
const englishSources = import.meta.glob('../Subapp-Docs子应用配置文档/en/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const preferredOrder = [
  '统一登录与静默续期-2026-09-30.md',
  'subapp接入文档1.md',
  'OAuth接入与外部注册说明.md',
  '测试身份适配指南.md',
  'api用量限制app接入指南.md',
  '接入错误经验总结.md',
];

const chineseDocuments = Object.entries(sources).map(([path, content]) => {
  const filename = path.split('/').pop() || path;
  return {
    filename,
    slug: filename.replace(/\.md$/i, ''),
    title: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || filename.replace(/\.md$/, ''),
    updated: content.match(/^>\s*(?:更新时间|更新|Updated)[:：]\s*(\d{4}-\d{2}-\d{2})/m)?.[1] || '',
    content,
    language: 'zh' as const,
  };
}).sort((a, b) => {
  const aOrder = preferredOrder.indexOf(a.filename);
  const bOrder = preferredOrder.indexOf(b.filename);
  return (aOrder < 0 ? preferredOrder.length : aOrder) - (bOrder < 0 ? preferredOrder.length : bOrder)
    || a.title.localeCompare(b.title, 'zh-CN');
});
const englishDocuments = chineseDocuments.map((doc) => {
  const englishSlug = translatedDocSlug(doc.slug, 'en');
  const filename = `${englishSlug}.md`;
  const content = englishSources[`../Subapp-Docs子应用配置文档/en/${filename}`];
  if (!content) throw new Error(`Missing English document: ${doc.filename}`);
  return {
    ...doc,
    filename,
    slug: englishSlug,
    title: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || doc.title,
    updated: content.match(/^>\s*Updated[:：]\s*(\d{4}-\d{2}-\d{2})/m)?.[1] || doc.updated,
    content,
    language: 'en' as const,
  };
});
if (Object.keys(englishSources).length !== chineseDocuments.length) {
  throw new Error('English and Chinese developer guide counts must match');
}
export const seoDocuments = [...chineseDocuments, ...englishDocuments];
const guides: Record<DocsLanguage, string> = { zh: userGuide, en: userGuideEnglish };
const languageFromPath = (path: string): DocsLanguage => /^\/(?:dev|user)\/docs\/en(?:\/|$)/.test(path) ? 'en' : 'zh';
const userGuideUpdated = (content: string) => content.match(/^>\s*(?:更新时间|Updated)[:：]\s*(\d{4}-\d{2}-\d{2})/m)?.[1] || __DOCS_BUILD_DATE__;

export function DocsLanguageRedirect({ kind }: { kind: 'dev' | 'user' }) {
  const navigate = useNavigate();
  const location = useLocation();
  useLayoutEffect(() => {
    const language = preferredDocsLanguage(typeof navigator === 'undefined' ? null : navigator.languages?.join(',') || navigator.language || null);
    const filename = new URLSearchParams(location.search).get('doc');
    const documentPath = kind === 'dev' && filename && chineseDocuments.some((doc) => doc.filename === filename)
      ? `/dev/docs/${encodeURIComponent(filename.replace(/\.md$/i, ''))}` : location.pathname;
    navigate(`${localizedDocsPath(documentPath, language)}${location.hash}`, { replace: true });
  }, [kind, location.hash, location.pathname, location.search, navigate]);
  return null;
}

function MarkdownArticle({ content, linkDocs, language }: { content: string; linkDocs?: boolean; language: DocsLanguage }) {
  return <div className="docs-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      h1: ({ children }) => <h2>{children}</h2>,
      a: ({ href = '', children }) => {
        if (linkDocs && !/^(?:[a-z]+:|\/|#)/i.test(href)) {
          const [relativePath, fragment] = href.split('#');
          const filename = decodeURIComponent(relativePath.split('/').pop() || '');
          const slug = translatedDocSlug(filename.replace(/\.md$/i, ''), language);
          if (seoDocuments.some((doc) => doc.language === language && doc.slug === slug)) {
            return <Link to={`/dev/docs/${language}/${encodeURIComponent(slug)}${fragment ? `#${fragment}` : ''}`}>{children}</Link>;
          }
        }
        if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        return <a href={href}>{children}</a>;
      },
    }}>{content}</ReactMarkdown>
  </div>;
}

function DocsShell({ title, subtitle, backTo, language, switchTo, children }: { title: string; subtitle: string; backTo: string; language: DocsLanguage; switchTo: (language: DocsLanguage) => string; children: React.ReactNode }) {
  const { theme, setTheme } = useThemeMode('light');
  useEffect(() => {
    const priorLanguage = document.documentElement.lang;
    const priorTitle = document.title;
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.title = `${title} | Aryuki Auth Center`;
    return () => { document.documentElement.lang = priorLanguage; document.title = priorTitle; };
  }, [language, title]);
  return <div data-theme={theme} className="dashboard-theme docs-page min-h-dvh bg-[var(--bg)] text-[var(--text-primary)]">
    <header className="docs-header">
      <div className="docs-header-inner">
        <Link to={backTo} className="docs-brand" aria-label="Auth Center"><span className="ui-logo-badge"><Shield size={19} /></span><span>Auth Center</span></Link>
        <div className="docs-header-actions"><nav className="docs-language-switch" aria-label={language === 'zh' ? '文档语言' : 'Documentation language'}><Link to={switchTo('zh')} aria-current={language === 'zh' ? 'page' : undefined} lang="zh-CN">中文</Link><Link to={switchTo('en')} aria-current={language === 'en' ? 'page' : undefined} lang="en">EN</Link></nav><ThemeToggle theme={theme} onChange={setTheme} /><Link to={backTo} className="ui-button-secondary docs-home"><ArrowLeft size={16} /> {language === 'zh' ? '返回' : 'Back'}</Link></div>
      </div>
    </header>
    <main className="docs-container">
      <div className="docs-heading"><div><span className="docs-eyebrow"><BookOpen size={15} /> DOCUMENTATION</span><h1>{title}</h1><p>{subtitle}</p></div><span className="docs-published"><CalendarDays size={15} /> {language === 'zh' ? '页面更新' : 'Page updated'} {__DOCS_BUILD_DATE__}</span></div>
      {children}
    </main>
  </div>;
}

export function SubappDocsPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const language = languageFromPath(location.pathname);
  const documents: Array<{ filename: string; slug: string; title: string; updated: string; content: string; language: DocsLanguage }> = language === 'en' ? englishDocuments : chineseDocuments;
  const docSlug = decodeURIComponent(location.pathname.replace(/^\/dev\/docs\/(?:en|zh)\/?/, '').replace(/^\/dev\/docs\/?/, ''));
  const [search, setSearch] = useState('');
  const filename = params.get('doc');
  const selected = docSlug
    ? documents.find((doc) => doc.slug === docSlug)
    : documents.find((doc) => doc.filename === filename);
  const filtered = useMemo(() => documents.filter((doc) => `${doc.title} ${doc.filename} ${doc.content}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [search]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [selected?.filename]);

  return <DocsShell title={selected?.title || (language === 'zh' ? '子应用接入文档' : 'Subapp integration docs')} subtitle={language === 'zh' ? '登录、权限、测试身份与用量接入' : 'SSO, permissions, test identities, and quotas'} backTo="/dash" language={language} switchTo={(next) => `/dev/docs/${next}${selected ? `/${encodeURIComponent(translatedDocSlug(selected.slug, next))}` : ''}${location.hash}`}>
    <div className="docs-layout">
      <aside className="docs-sidebar" aria-label={language === 'zh' ? '文档目录' : 'Document index'}>
        <div className="docs-search"><input aria-label={language === 'zh' ? '搜索文档' : 'Search documents'} placeholder={language === 'zh' ? '搜索文档' : 'Search documents'} value={search} onChange={(event) => setSearch(event.target.value)} /><Search size={18} /></div>
        <div className="docs-list" role="navigation" aria-label={language === 'zh' ? '子应用文档' : 'Subapp documents'}>
          {filtered.map((doc) => <Link key={doc.filename} to={`/dev/docs/${language}/${encodeURIComponent(doc.slug)}`} className="docs-list-item" data-active={doc.filename === selected?.filename}><span>{doc.title}</span>{doc.updated && <small>{doc.updated}</small>}</Link>)}
          {!filtered.length && <p className="docs-empty">{language === 'zh' ? '没有匹配的文档' : 'No matching documents'}</p>}
        </div>
      </aside>
      <article className="docs-article">
        {selected ? <><div className="docs-article-meta"><span>{language === 'zh' ? '子应用文档' : 'Subapp guide'} / {documents.indexOf(selected) + 1} of {documents.length}</span>{selected.updated && <span>{language === 'zh' ? '文档更新' : 'Updated'} {selected.updated}</span>}</div><MarkdownArticle content={selected.content} linkDocs language={language} /></> : <><div className="docs-article-meta"><span>{language === 'zh' ? '全部文档' : 'All documents'}</span><span>{documents.length} {language === 'zh' ? '篇' : 'guides'}</span></div><nav className="docs-index-list" aria-label={language === 'zh' ? '子应用接入指南' : 'Subapp integration guides'}>{documents.map((doc) => <Link className="docs-index-row" key={doc.filename} to={`/dev/docs/${language}/${encodeURIComponent(doc.slug)}`}><span>{doc.title}</span>{doc.updated ? <small>{doc.updated}</small> : null}</Link>)}</nav></>}
      </article>
    </div>
  </DocsShell>;
}

export function UserDocsPage() {
  const location = useLocation();
  const language = languageFromPath(location.pathname);
  const guide = guides[language];
  const [open, setOpen] = useState(false);
  const sections = useMemo(() => [...guide.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]), [guide]);
  return <DocsShell title={language === 'zh' ? '用户使用指南' : 'User guide'} subtitle={language === 'zh' ? '登录、资料与账号安全' : 'Sign-in, profile, and account security'} backTo="/user" language={language} switchTo={(next) => `/user/docs/${next}${location.hash}`}>
    <div className="docs-layout docs-user-layout">
      <aside className="docs-sidebar docs-user-nav" aria-label={language === 'zh' ? '教程目录' : 'Guide contents'}>
        <button type="button" className="docs-mobile-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{language === 'zh' ? '教程目录' : 'Contents'} <ChevronDown size={16} /></button>
        <nav className={open ? 'docs-list is-open' : 'docs-list'}>{sections.map((section, index) => <a key={section} href={`#guide-${index}`} className="docs-list-item" onClick={() => setOpen(false)}>{section}</a>)}</nav>
      </aside>
      <article className="docs-article"><div className="docs-article-meta"><span>{language === 'zh' ? '用户教程' : 'User guide'}</span><span>{language === 'zh' ? '文档更新' : 'Updated'} {userGuideUpdated(guide)}</span></div><UserGuideArticle content={guide.replace(/^# [^\n]+\n+/, '')} /></article>
    </div>
  </DocsShell>;
}

function UserGuideArticle({ content }: { content: string }) {
  let section = 0;
  return <div className="docs-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    h2: ({ children }) => <h2 id={`guide-${section++}`}>{children}</h2>,
    a: ({ href = '/user', children }) => <Link to={href}>{children}</Link>,
  }}>{content}</ReactMarkdown></div>;
}
