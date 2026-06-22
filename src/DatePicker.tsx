import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value?: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function DatePicker({
  name,
  value,
  defaultValue = '',
  onChange,
  placeholder = 'Select date',
}: {
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const selectedValue = controlled ? value || '' : internalValue;
  const selectedDate = parseDateValue(selectedValue);
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<'day' | 'month'>('day');
  const [viewDate, setViewDate] = React.useState(selectedDate || new Date());
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (selectedDate) setViewDate(selectedDate);
  }, [selectedValue]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const setSelectedValue = (nextValue: string) => {
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekCount = Math.ceil((startOffset + daysInMonth) / 7);
  const cells = Array.from({ length: weekCount * 7 }, (_, index) => {
    const day = index - startOffset + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(viewDate);
  const monthNames = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(year, index, 1)));

  return (
    <div ref={rootRef} className="relative">
      {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
      <button
        type="button"
        className="ui-date-trigger flex min-h-[44px] w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-left text-sm text-[var(--text-primary)]"
        onClick={() => setOpen((current) => {
          const next = !current;
          if (next) setMode('day');
          return next;
        })}
      >
        <span className={selectedValue ? '' : 'text-[var(--text-tertiary)]'}>{selectedValue || placeholder}</span>
        <CalendarDays className="h-4 w-4 text-[var(--primary)]" />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-[260px] max-w-[calc(100vw-32px)] rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="ui-icon-button h-8 w-8"
              onClick={() => setViewDate(mode === 'day' ? new Date(year, month - 1, 1) : new Date(year - 1, month, 1))}
              aria-label={mode === 'day' ? 'Previous month' : 'Previous year'}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="rounded-[10px] px-3 py-1.5 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-alt)]"
              onClick={() => setMode((current) => current === 'day' ? 'month' : 'day')}
            >
              {mode === 'day' ? monthLabel : year}
            </button>
            <button
              type="button"
              className="ui-icon-button h-8 w-8"
              onClick={() => setViewDate(mode === 'day' ? new Date(year, month + 1, 1) : new Date(year + 1, month, 1))}
              aria-label={mode === 'day' ? 'Next month' : 'Next year'}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {mode === 'day' ? (
            <>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-[var(--text-tertiary)]">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((item, index) => <span key={`${item}-${index}`}>{item}</span>)}
              </div>
              <div className="mt-1.5 grid grid-cols-7 gap-0.5">
                {cells.map((day, index) => {
                  const dateValue = day ? toDateInputValue(new Date(year, month, day)) : '';
                  const active = dateValue && dateValue === selectedValue;
                  return (
                    <button
                      key={index}
                      type="button"
                      disabled={!day}
                      className={`h-7 rounded-[8px] text-xs font-semibold transition ${active ? 'bg-[var(--primary)] text-white' : day ? 'text-[var(--text-primary)] hover:bg-[var(--surface-alt)]' : 'cursor-default opacity-0'}`}
                      onClick={() => {
                        if (!dateValue) return;
                        setSelectedValue(dateValue);
                        setOpen(false);
                      }}
                    >
                      {day || ''}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" className="ui-button-secondary min-h-0 px-3 py-1.5 text-xs" onClick={() => setSelectedValue('')}>Clear</button>
                <button type="button" className="ui-button-secondary min-h-0 px-3 py-1.5 text-xs" onClick={() => {
                  const today = toDateInputValue(new Date());
                  setSelectedValue(today);
                  setViewDate(new Date());
                  setOpen(false);
                }}>Today</button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {monthNames.map((name, index) => {
                const active = index === month;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`h-8 rounded-[9px] text-xs font-semibold transition ${active ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-primary)] hover:bg-[var(--surface-alt)]'}`}
                    onClick={() => {
                      setViewDate(new Date(year, index, 1));
                      setMode('day');
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
