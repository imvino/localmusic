import { useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

// Compact filter chip + popover — replaces native <select> chrome which
// renders oversized on mobile. options: [{value, label}]
export default function ChipSelect({ value, options, onChange, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)?.label ?? value
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium px-3 py-2 rounded-full transition-colors whitespace-nowrap"
      >
        <span className="truncate max-w-[120px]">{current}</span>
        <ChevronDown size={13} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={`absolute top-full mt-1 z-50 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl min-w-[140px] max-h-64 overflow-y-auto ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {options.map(o => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-3 text-left px-4 py-2.5 text-sm whitespace-nowrap transition-colors ${o.value === value ? 'text-[#fc3c44] font-semibold' : 'text-zinc-300 hover:bg-zinc-800'}`}
              >
                {o.label}
                {o.value === value && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
