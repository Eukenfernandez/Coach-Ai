
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface DatePickerProps {
  value: string; // ISO format: YYYY-MM-DD
  onChange: (value: string) => void;
  locale?: 'es' | 'ing' | 'eus';
  placeholder?: string;
  required?: boolean;
  className?: string;
}

const MONTH_NAMES: Record<string, string[]> = {
  es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
  ing: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  eus: ['Urtarrila', 'Otsaila', 'Martxoa', 'Apirila', 'Maiatza', 'Ekaina', 'Uztaila', 'Abuztua', 'Iraila', 'Urria', 'Azaroa', 'Abendua']
};

const DAY_NAMES: Record<string, string[]> = {
  es: ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'],
  ing: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  eus: ['Al', 'As', 'Az', 'Og', 'Or', 'Lr', 'Ig']
};

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  locale = 'es',
  placeholder,
  required,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Parse the value or use today for the calendar view
  const parsed = value ? new Date(value + 'T00:00:00') : null;
  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.getMonth() ?? new Date().getMonth());

  // When external value changes, sync the view
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  const months = MONTH_NAMES[locale] || MONTH_NAMES.es;
  const days = DAY_NAMES[locale] || DAY_NAMES.es;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Calendar grid computation
  const firstDay = new Date(viewYear, viewMonth, 1);
  // getDay() returns 0=Sun. We want Monday=0, so shift.
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells: { day: number; month: 'prev' | 'current' | 'next'; dateStr: string }[] = [];

  // Previous month's trailing days
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = viewMonth === 0 ? 11 : viewMonth - 1;
    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
    cells.push({ day: d, month: 'prev', dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month: 'current', dateStr: `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  // Next month's leading days (fill to 42 cells = 6 rows)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const m = viewMonth === 11 ? 0 : viewMonth + 1;
    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
    cells.push({ day: d, month: 'next', dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDate = (dateStr: string) => {
    onChange(dateStr);
    setIsOpen(false);
  };

  // Format display value
  const displayValue = parsed
    ? `${String(parsed.getDate()).padStart(2, '0')}/${String(parsed.getMonth() + 1).padStart(2, '0')}/${parsed.getFullYear()}`
    : '';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input Trigger */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-full flex items-center gap-3 cursor-pointer
          bg-gray-50 dark:bg-neutral-800 text-neutral-900 dark:text-white
          p-3 rounded-lg border transition-all duration-200
          ${isOpen
            ? 'border-orange-500 ring-2 ring-orange-500/20'
            : 'border-neutral-300 dark:border-neutral-700 hover:border-orange-500/50'
          }
        `}
        role="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(!isOpen); } }}
      >
        <Calendar size={18} className="text-orange-500 flex-shrink-0" />
        <span className={displayValue ? 'text-sm' : 'text-sm text-neutral-400 dark:text-neutral-500'}>
          {displayValue || placeholder || 'dd/mm/yyyy'}
        </span>
        {required && <input type="text" value={value} required tabIndex={-1} className="sr-only" readOnly aria-hidden="true" />}
      </div>

      {/* Calendar Popover */}
      {isOpen && (
        <div
          ref={calendarRef}
          className="
            absolute z-[100] mt-2 left-0 right-0
            bg-neutral-900 border border-neutral-700/50
            rounded-2xl shadow-2xl shadow-black/40
            overflow-hidden
            animate-in fade-in slide-in-from-top-2 duration-200
          "
          role="dialog"
          aria-label="Calendar"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-white tracking-wide">
              {months[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={goToNextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day Names */}
          <div className="grid grid-cols-7 px-3 pt-3 pb-1">
            {days.map(d => (
              <div key={d} className="text-center text-[11px] font-medium text-neutral-500 uppercase tracking-wider py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-0.5 px-3 pb-4">
            {cells.map((cell, idx) => {
              const isSelected = cell.dateStr === value;
              const isToday = cell.dateStr === todayStr;
              const isOtherMonth = cell.month !== 'current';

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectDate(cell.dateStr)}
                  className={`
                    relative w-full aspect-square flex items-center justify-center
                    text-sm rounded-xl transition-all duration-150 font-medium
                    ${isSelected
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30 scale-105'
                      : isToday
                        ? 'bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/30'
                        : isOtherMonth
                          ? 'text-neutral-600 hover:bg-neutral-800 hover:text-neutral-300'
                          : 'text-neutral-200 hover:bg-neutral-800 hover:text-white'
                    }
                  `}
                  aria-selected={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Today shortcut */}
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={() => { selectDate(todayStr); }}
              className="w-full text-xs text-center py-2 rounded-lg text-orange-400 hover:bg-orange-500/10 transition-colors font-medium"
            >
              {locale === 'ing' ? 'Today' : locale === 'eus' ? 'Gaur' : 'Hoy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
