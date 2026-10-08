import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CalendarDays, ChevronDown, Search, Shield } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggle, useThemeMode } from './theme';
import userGuide from '../docs/user-guide.md?raw';
import './docs.css';

const sources = import.meta.glob('../Subapp-Docs子应用配置文档/*.md', {
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

export const seoDocuments = Object.entries(sources).map(([path, content]) => {
  const filename = path.split('/').pop() || path;
  return {
    filename,
    slug: filename.replace(/\.md$/i, ''),
    title: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || filename.replace(/\.md$/, ''),
    updated: content.match(/^>\s*(?:更新时间|更新|Updated)[:：]\s*(\d{4}-\d{2}-\d{2})/m)?.[1] || '',
    content,
  };
}).sort((a, b) => {
  const aOrder = preferredOrder.indexOf(a.filename);
  const bOrder = preferredOrder.indexOf(b.filename);
  return (aOrder < 0 ? preferredOrder.length : aOrder) - (bOrder < 0 ? preferredOrder.length : bOrder)
    || a.title.localeCompare(b.title, 'zh-CN');
});
const documents = seoDocuments;
const userGuideUpdated = userGuide.match(/^>\s*更新时间[:：]\s*(\d{4}-\d{2}-\d{2})/m)?.[1] || __DOCS_BUILD_DATE__;

function MarkdownArticle({ content, linkDocs }: { content: string; linkDocs?: boolean }) {
  return <div className="docs-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      h1: ({ children }) => <h2>{children}</h2>,
      a: ({ href = '', children }) => {
        if (linkDocs && !/^(?:[a-z]+:|\/|#)/i.test(href)) {
          const [relativePath, fragment] = href.split('#');
          const filename = decodeURIComponent(relativePath.split('/').pop() || '');
          if (documents.some((doc) => doc.filename === filename)) {
            return <Link to={`/dev/docs/${encodeURIComponent(filename.replace(/\.md$/i, ''))}${fragment ? `#${fragment}` : ''}`}>{children}</Link>;
          }
        }
        if (/^https?:\/\//i.test(href)) return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        return <a href={href}>{children}</a>;
      },
    }}>{content}</ReactMarkdown>
  </div>;
}

function DocsShell({ title, subtitle, backTo, children }: { title: string; subtitle: string; backTo: string; children: React.ReactNode }) {
  const { theme, setTheme } = useThemeMode('light');
  return <div data-theme={theme} className="dashboard-theme docs-page min-h-dvh bg-[var(--bg)] text-[var(--text-primary)]">
    <header className="docs-header">
      <div className="docs-header-inner">
        <Link to={backTo} className="docs-brand" aria-label="Auth Center"><span className="ui-logo-badge"><Shield size={19} /></span><span>Auth Center</span></Link>
        <div className="docs-header-actions"><ThemeToggle theme={theme} onChange={setTheme} /><Link to={backTo} className="ui-button-secondary docs-home"><ArrowLeft size={16} /> Back</Link></div>
      </div>
    </header>
    <main className="docs-container">
      <div className="docs-heading"><div><span className="docs-eyebrow"><BookOpen size={15} /> DOCUMENTATION</span><h1>{title}</h1><p>{subtitle}</p></div><span className="docs-published"><CalendarDays size={15} /> 页面更新 {__DOCS_BUILD_DATE__}</span></div>
      {children}
    </main>
  </div>;
}

export function SubappDocsPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const docSlug = location.pathname.startsWith('/dev/docs/') ? decodeURIComponent(location.pathname.slice('/dev/docs/'.length)) : '';
  const [search, setSearch] = useState('');
  const filename = params.get('doc');
  const selected = docSlug
    ? documents.find((doc) => doc.slug === docSlug)
    : documents.find((doc) => doc.filename === filename);
  const filtered = useMemo(() => documents.filter((doc) => `${doc.title} ${doc.filename} ${doc.content}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [search]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [selected?.filename]);

  return <DocsShell title={selected?.title || '子应用接入文档'} subtitle="登录、权限、测试身份与用量接入" backTo="/dash">
    <div className="docs-layout">
      <aside className="docs-sidebar" aria-label="文档目录">
        <div className="docs-search"><input aria-label="搜索文档" placeholder="搜索文档" value={search} onChange={(event) => setSearch(event.target.value)} /><Search size={18} /></div>
        <div className="docs-list" role="navigation" aria-label="子应用文档">
          {filtered.map((doc) => <Link key={doc.filename} to={`/dev/docs/${encodeURIComponent(doc.slug)}`} className="docs-list-item" data-active={doc.filename === selected?.filename}><span>{doc.title}</span>{doc.updated && <small>{doc.updated}</small>}</Link>)}
          {!filtered.length && <p className="docs-empty">没有匹配的文档</p>}
        </div>
      </aside>
      <article className="docs-article">
        {selected ? <><div className="docs-article-meta"><span>子应用文档 / {documents.indexOf(selected) + 1} of {documents.length}</span>{selected.updated && <span>文档更新 {selected.updated}</span>}</div><MarkdownArticle content={selected.content} linkDocs /></> : <><div className="docs-article-meta"><span>全部文档</span><span>{documents.length} 篇</span></div><nav className="docs-index-list" aria-label="子应用接入指南">{documents.map((doc) => <Link className="docs-index-row" key={doc.filename} to={`/dev/docs/${encodeURIComponent(doc.slug)}`}><span>{doc.title}</span>{doc.updated ? <small>{doc.updated}</small> : null}</Link>)}</nav></>}
      </article>
    </div>
  </DocsShell>;
}

export function UserDocsPage() {
  const [open, setOpen] = useState(false);
  const sections = useMemo(() => [...userGuide.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1]), []);
  return <DocsShell title="用户使用指南" subtitle="登录、资料与账号安全" backTo="/user">
    <div className="docs-layout docs-user-layout">
      <aside className="docs-sidebar docs-user-nav" aria-label="教程目录">
        <button type="button" className="docs-mobile-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>教程目录 <ChevronDown size={16} /></button>
        <nav className={open ? 'docs-list is-open' : 'docs-list'}>{sections.map((section, index) => <a key={section} href={`#guide-${index}`} className="docs-list-item" onClick={() => setOpen(false)}>{section}</a>)}</nav>
      </aside>
      <article className="docs-article"><div className="docs-article-meta"><span>用户教程</span><span>文档更新 {userGuideUpdated}</span></div><UserGuideArticle content={userGuide.replace(/^# [^\n]+\n+/, '')} /></article>
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
