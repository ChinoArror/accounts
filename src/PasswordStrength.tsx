import { passwordStrength } from './passwordPolicy';

export default function PasswordStrength({ password }: { password: string }) {
  const strength = passwordStrength(password);
  const label = ['Enter a password', 'Low', 'Medium', 'High'][strength];
  const colors = ['bg-[var(--border)]', 'bg-[var(--danger)]', 'bg-amber-500', 'bg-[var(--success)]'];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5" aria-label={`Password strength: ${label}`}>
        {[1, 2, 3].map((level) => <span key={level} className={`h-1.5 flex-1 rounded-full ${level <= strength ? colors[strength] : colors[0]}`} />)}
      </div>
      <p className="mt-1.5 text-xs text-[var(--text-secondary)]">{label} · At least 8 characters with letters and numbers. Low strength is not accepted.</p>
    </div>
  );
}
