import { useEffect, useRef, useState } from 'react';

// ── Searchable dropdown ──────────────────────────────────────────────────────
// Extracted from the timesheet editor so event (and future) forms can reuse it.
// `displayFn` formats the selected value shown on the trigger button, while
// `displayOptionFn` formats each row in the dropdown list.

const SearchSelect = ({ options, value, onChange, placeholder, label, displayFn, displayOptionFn, disabled }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = options.filter((opt) => {
    const text = displayOptionFn ? displayOptionFn(opt) : (displayFn ? displayFn(opt) : opt.name || opt.label || String(opt));
    return text.toLowerCase().includes(search.toLowerCase());
  });

  const selectedLabel = value
    ? displayFn
      ? displayFn(options.find((o) => o.id === value) || value)
      : String(value)
    : '';

  return (
    <div className="relative" ref={ref}>
      {label && (
        <label className="font-label-caps text-label-caps text-on-surface-variant block mb-1">{label}</label>
      )}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full text-left rounded-DEFAULT border-outline-variant bg-surface py-2 px-4 font-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary transition-colors h-11 shadow-sm flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className={selectedLabel ? 'text-on-surface' : 'text-outline'}>
          {selectedLabel || placeholder || 'Select...'}
        </span>
        <span className="material-symbols-outlined text-outline text-lg">expand_more</span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b border-surface-variant">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="w-full rounded border-outline-variant bg-surface py-1.5 px-3 font-body-md text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary text-sm"
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-on-surface-variant text-center">No matches</p>
            ) : (
              filtered.map((opt) => {
                const optLabel = displayOptionFn ? displayOptionFn(opt) : (displayFn ? displayFn(opt) : opt.name || opt.label || String(opt));
                const isSelected = opt.id === value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      onChange(opt.id);
                      setSearch('');
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm font-body-md transition-colors ${
                      isSelected
                        ? 'bg-primary-container text-on-primary font-semibold'
                        : 'text-on-surface hover:bg-surface-variant'
                    }`}
                  >
                    {optLabel}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchSelect;
