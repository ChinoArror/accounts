import React from 'react';
import { motion } from 'motion/react';
import { ArrowUpRight, Clock3, Crosshair, LoaderCircle, LogOut, Play, ScanLine, ShieldOff } from 'lucide-react';

type PreviewData = {
  identity: { name: string; display_name: string; role: 'admin' | 'user'; expires_at: string };
  session: { expires_at: string };
  apps: Array<{ app_id: string; app_name: string }>;
};

type PreviewPhase = 'checking' | 'denied' | 'ready' | 'apps';

function formatRemaining(expiresAt?: string, now = Date.now()) {
  const remainingSeconds = Math.max(0, Math.ceil((Date.parse(expiresAt || '') - now) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function TestIdentityPreview() {
  const [phase, setPhase] = React.useState<PreviewPhase>('checking');
  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [opening, setOpening] = React.useState(false);
  const [launching, setLaunching] = React.useState('');
  const [error, setError] = React.useState('');
  const bootstrapped = React.useRef(false);

  const loadSession = React.useCallback(async () => {
    const response = await fetch('/preview/api/session', { credentials: 'include', cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok) {
      setPreview(null);
      setPhase('denied');
      return false;
    }
    setPreview(body as PreviewData);
    setPhase('ready');
    return true;
  }, []);

  React.useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    let alive = true;
    const bootstrap = async () => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const name = fragment.get('name') || '';
      const secret = fragment.get('secret') || '';
      if (window.location.hash) window.history.replaceState(null, '', '/preview');
      try {
        if (name && secret) {
          const exchange = await fetch('/preview/api/session', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, secret }),
          });
          if (!exchange.ok) {
            if (alive) setPhase('denied');
            return;
          }
        }
        if (alive) await loadSession();
      } catch {
        if (alive) setPhase('denied');
      }
    };
    void bootstrap();
    return () => { alive = false; };
  }, [loadSession]);

  React.useEffect(() => {
    if (!preview || (phase !== 'ready' && phase !== 'apps')) return;
    const timer = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (Date.parse(preview.session.expires_at) <= nextNow) {
        setPreview(null);
        setPhase('denied');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, preview]);

  const start = () => {
    if (opening || phase !== 'ready') return;
    setOpening(true);
    window.setTimeout(() => {
      setPhase('apps');
      setOpening(false);
    }, 620);
  };

  const launch = async (appId: string) => {
    if (launching) return;
    const launchTab = window.open('', '_blank');
    if (!launchTab) {
      setError('Allow pop-ups to open this app.');
      return;
    }
    launchTab.opener = null;
    setLaunching(appId);
    setError('');
    try {
      const response = await fetch('/preview/api/launch', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.redirect_url) throw new Error('Unable to open this app.');
      launchTab.location.replace(body.redirect_url);
      window.setTimeout(() => setLaunching(''), 2000);
    } catch (err: any) {
      launchTab.close();
      setError(err?.message || 'Unable to open this app.');
      setLaunching('');
    }
  };

  const logout = async () => {
    await fetch('/preview/api/logout', { method: 'POST', credentials: 'include', cache: 'no-store' }).catch(() => null);
    setPreview(null);
    setPhase('denied');
  };

  const remaining = formatRemaining(preview?.session.expires_at, now);
  const identityName = preview?.identity.display_name || preview?.identity.name;

  return (
    <main className={`preview-redline-shell ${opening ? 'preview-redline-shell--opening' : ''}`}>
      <div className="preview-redline-backdrop" aria-hidden="true" />
      <div className="preview-redline-veil" aria-hidden="true" />
      <span className="preview-cut-line preview-cut-line--one" aria-hidden="true" />
      <span className="preview-cut-line preview-cut-line--two" aria-hidden="true" />

      <header className="preview-redline-header">
        <div className="preview-command-mark" aria-label="Auth Center Preview">
          <span className="preview-command-slash" aria-hidden="true" />
          <span>AUTH<br />PREVIEW</span>
        </div>
        <div className="preview-redline-meta">
          {(phase === 'ready' || phase === 'apps') && preview ? (
            <span className="preview-redline-time" aria-label={`Session expires in ${remaining}`}>
              <Clock3 className="h-4 w-4" aria-hidden="true" />
              {remaining}
            </span>
          ) : null}
        </div>
      </header>

      <section className="preview-redline-content" aria-live="polite">
        {phase === 'checking' ? (
          <div className="preview-redline-status">
            <LoaderCircle className="preview-redline-loader" aria-hidden="true" />
            <p>VERIFYING ACCESS</p>
          </div>
        ) : null}

        {phase === 'denied' ? (
          <motion.div
            initial={{ opacity: 0, y: 18, skewY: -2 }}
            animate={{ opacity: 1, y: 0, skewY: 0 }}
            className="preview-redline-status preview-redline-status--denied"
          >
            <ShieldOff className="h-9 w-9" aria-hidden="true" />
            <p className="preview-status-code">ACCESS / 403</p>
            <h1>NO PREVIEW ACCESS</h1>
            <p>Open a valid Preview link to continue.</p>
          </motion.div>
        ) : null}

        {phase === 'ready' ? (
          <div className="preview-launch-stage">
            <span className="preview-stage-index">PREVIEW MODE / READY</span>
            <span className="preview-launch-vector preview-launch-vector--left" aria-hidden="true" />
            <span className="preview-launch-vector preview-launch-vector--right" aria-hidden="true" />
            <span className="preview-launch-sight" aria-hidden="true"><Crosshair /></span>
            <button type="button" className="preview-launch-core" onClick={start} aria-label="Start Preview">
              <Play className="h-6 w-6 fill-current" aria-hidden="true" />
              <span>LAUNCH</span>
            </button>
            <p className="preview-redline-identity">{identityName}</p>
          </div>
        ) : null}

        {phase === 'apps' && preview ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: 'spring', damping: 24, stiffness: 260 }}
            className="preview-app-matrix"
          >
            <div className="preview-app-matrix-head">
              <div>
                <p>APP ROUTING</p>
                <h1>{identityName}</h1>
              </div>
              <button type="button" onClick={logout} className="preview-end-session" aria-label="End Preview session" title="End Preview session">
                <LogOut className="h-4 w-4" />
                <span>END</span>
              </button>
            </div>
            {error ? <p className="preview-redline-error">{error}</p> : null}
            <div className="preview-app-matrix-grid">
              {preview.apps.map((app, index) => (
                <button
                  key={app.app_id}
                  type="button"
                  onClick={() => void launch(app.app_id)}
                  className={`preview-app-plate preview-app-plate--${index % 4}`}
                  disabled={Boolean(launching)}
                >
                  <span className="preview-app-order">0{index + 1}</span>
                  <span className="preview-plate-id">{app.app_id}</span>
                  <span className="preview-plate-name">{app.app_name}</span>
                  <span className="preview-plate-open">
                    {launching === app.app_id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUpRight className="h-4 w-4" />}
                  </span>
                </button>
              ))}
            </div>
            <div className="preview-app-matrix-foot"><ScanLine className="h-4 w-4" aria-hidden="true" /> SELECT AN APPLICATION TO CONTINUE</div>
          </motion.div>
        ) : null}
      </section>
    </main>
  );
}
