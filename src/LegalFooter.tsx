import { Link } from 'react-router-dom';

export default function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`ac-legal-footer w-full border-t border-[var(--divider)] bg-[var(--bg)] px-4 py-4 text-xs text-[var(--text-tertiary)] ${className}`}>
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="m-0">© {new Date().getFullYear()} Aryuki Auth Center. All rights reserved. 版权所有。</p>
        <Link to="/privacy" className="rounded-sm text-[var(--text-secondary)] underline decoration-[var(--border)] underline-offset-4 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)]">
          Privacy Policy · 隐私权政策
        </Link>
      </div>
    </footer>
  );
}
