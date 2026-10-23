import { alternateCnCallback } from './appCallback';

type Props = {
  id: string;
  checked: boolean;
  callbackUrl: string;
  onChange: (checked: boolean) => void;
  name?: string;
};

export function CnCallbackSwitch({ id, checked, callbackUrl, onChange, name }: Props) {
  const alternate = alternateCnCallback(callbackUrl);
  return <div className="space-y-2">
    <label htmlFor={id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/25 p-3 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white">Enable .cn callback</span>
        <span className="block text-xs text-white/60">Allow the matching Aryuki .cn host and callback path.</span>
      </span>
      <span className="relative shrink-0">
        <input id={id} name={name} type="checkbox" role="switch" checked={checked} disabled={!alternate && !checked}
          onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
        <span aria-hidden="true" className="block h-7 w-12 rounded-full bg-white/25 transition-colors peer-checked:bg-emerald-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-300 peer-disabled:opacity-40" />
        <span aria-hidden="true" className="pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5 peer-disabled:opacity-60" />
      </span>
    </label>
    {alternate ? <p className="break-all text-xs text-white/60">.cn callback: <code>{alternate}</code></p>
      : <p className="text-xs text-amber-300">Enter an Aryuki HTTPS .com callback without query or fragment to enable this option.</p>}
  </div>;
}
