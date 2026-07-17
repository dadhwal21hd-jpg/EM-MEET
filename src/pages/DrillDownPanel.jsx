import { useState, useMemo, useEffect } from 'react'
import { useDelayReport } from '../hooks/useDelayReport'

// ── Pure helpers ──────────────────────────────────────────────────────────────

const fmtDelay = (raw) => {
  if (!raw) return '—'
  return raw.replace(/\s*\((Delayed|On Time)\)\s*$/i, '').trim() || raw
}

const fmtDate = (d) => {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return String(d) }
}

function plural(n, w) { return `${n} ${w}${n !== 1 ? 's' : ''}` }

// Pieces are summed over distinct lots by the backend; null qty counts as 0.
function pcs(n) { return (n ?? 0).toLocaleString() }

// Parse "3d 2h (Delayed)" → total fractional days
function parseDelayDays(raw) {
  if (!raw) return 0
  let h = 0
  const d  = raw.match(/(\d+)\s*d/)
  const hr = raw.match(/(\d+)\s*h/)
  if (d)  h += parseInt(d[1])  * 24
  if (hr) h += parseInt(hr[1])
  return h / 24
}

const COL_DEFAULT_DIR = {
  delay_days:    'desc',
  delivery_date: 'desc',
  lot_number:    'asc',
  customer_name: 'asc',
  step_name:     'asc',
}

function sortLots(lots, key, dir) {
  return [...lots].sort((a, b) => {
    if (key === 'delivery_date') {
      const va = a.delivery_date ? new Date(a.delivery_date).getTime() : 0
      const vb = b.delivery_date ? new Date(b.delivery_date).getTime() : 0
      return dir === 'asc' ? va - vb : vb - va
    }
    if (key === 'delay_days') {
      const va = a.delay_days ?? parseDelayDays(a.delay_raw)
      const vb = b.delay_days ?? parseDelayDays(b.delay_raw)
      return dir === 'asc' ? va - vb : vb - va
    }
    const cmp = (a[key] || '').localeCompare(b[key] || '')
    return dir === 'asc' ? cmp : -cmp
  })
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function DelayBadge({ days }) {
  if (!days || days <= 0) return null
  const cls = days > 7
    ? 'bg-red-100 text-red-700 border border-red-200'
    : days >= 3
    ? 'bg-orange-100 text-orange-700 border border-orange-200'
    : 'bg-yellow-100 text-yellow-700 border border-yellow-200'
  return (
    <span className={`inline-block font-mono text-xs font-semibold rounded px-1.5 py-0.5 ${cls}`}>
      +{days}d
    </span>
  )
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) {
    return (
      <span className="inline-flex flex-col leading-none ml-1 opacity-30">
        <span style={{ fontSize: 7 }}>▲</span>
        <span style={{ fontSize: 7 }}>▼</span>
      </span>
    )
  }
  return (
    <span className="inline-block ml-1 text-blue-400" style={{ fontSize: 8 }}>
      {sortDir === 'asc' ? '▲' : '▼'}
    </span>
  )
}

// Module-level so React never sees it as a new component type between renders
function Th({ col, children, className = '', sortKey, sortDir, onSort }) {
  return (
    <th
      className={`text-left px-4 py-2.5 cursor-pointer hover:text-gray-600 select-none transition-colors ${className}`}
      onClick={() => onSort(col)}
    >
      {children}
      <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
    </th>
  )
}

// ── Metric card (drilldown summary) ──────────────────────────────────────────

function MetricCard({ label, value, valueColor = 'text-gray-900', sub }) {
  const isText = typeof value === 'string' && isNaN(Number(value)) && value !== '—'
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 flex flex-col justify-between">
      <div className={`font-bold leading-none ${isText ? 'text-sm text-gray-700 truncate' : `text-2xl ${valueColor}`}`}>
        {value ?? '—'}
      </div>
      <div className="text-xs text-gray-400 mt-2 leading-tight">{label}</div>
      {sub && <div className="text-xs text-gray-300 mt-0.5 truncate">{sub}</div>}
    </div>
  )
}

// ── Step breakdown chart ──────────────────────────────────────────────────────

function StepBreakdown({ lots }) {
  if (!lots.length) return null

  const counts = {}
  lots.forEach(l => {
    const s = l.step_name || 'Unknown'
    counts[s] = (counts[s] || 0) + 1
  })

  const entries = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7)

  const max = entries[0]?.[1] ?? 1

  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Bottleneck breakdown (active fires)
      </p>
      <div className="space-y-2.5">
        {entries.map(([step, count]) => {
          const pct = Math.round((count / max) * 100)
          return (
            <div key={step} className="flex items-center gap-3">
              <div className="text-xs text-gray-600 w-40 shrink-0 truncate" title={step}>
                {step}
              </div>
              <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-red-400 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-xs font-semibold text-gray-500 w-4 text-right shrink-0">
                {count}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Lot row components ────────────────────────────────────────────────────────

function ActiveLotRow({ lot }) {
  const accent = (lot.delay_days || 0) > 7
    ? 'border-l-[3px] border-l-red-400 hover:bg-red-50/30'
    : (lot.delay_days || 0) >= 3
    ? 'border-l-[3px] border-l-orange-300 hover:bg-orange-50/20'
    : 'hover:bg-gray-50'

  return (
    <tr className={`border-b border-gray-50 last:border-0 transition-colors ${accent}`}>
      <td className="px-4 py-2.5 font-mono text-xs text-gray-700 align-top whitespace-nowrap">
        {lot.lot_number || '—'}
      </td>
      <td className="px-4 py-2.5 align-top">
        <div className="font-medium text-gray-900 text-sm">{lot.customer_name || '—'}</div>
        {lot.style_num && (
          <div className="text-xs text-gray-400 mt-0.5">
            {lot.style_num}
            {lot.colour ? ` · ${lot.colour}` : ''}
            {lot.qty    ? ` · qty ${lot.qty}` : ''}
          </div>
        )}
      </td>
      <td className="px-4 py-2.5 text-xs align-top hidden md:table-cell">
        <div className="text-gray-600">{lot.step_name || '—'}</div>
        <div className="text-gray-400 mt-0.5">{lot.fms_name || ''}</div>
      </td>
      <td className="px-4 py-2.5 align-top">
        {lot.delay_days
          ? <DelayBadge days={lot.delay_days} />
          : <span className="font-mono text-xs text-gray-400">{fmtDelay(lot.delay_raw)}</span>
        }
      </td>
      <td className="px-4 py-2.5 text-gray-400 text-xs align-top whitespace-nowrap hidden sm:table-cell">
        {fmtDate(lot.delivery_date)}
      </td>
    </tr>
  )
}

function HistoryLotRow({ lot }) {
  return (
    <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-2.5 font-mono text-xs text-gray-500 align-top whitespace-nowrap">
        {lot.lot_number || '—'}
      </td>
      <td className="px-4 py-2.5 align-top">
        <div className="text-gray-600 text-sm">{lot.customer_name || '—'}</div>
        {lot.style_num && (
          <div className="text-xs text-gray-400 mt-0.5">{lot.style_num}</div>
        )}
      </td>
      <td className="px-4 py-2.5 text-gray-500 text-xs align-top hidden md:table-cell">
        {lot.step_name || '—'}
      </td>
      <td className="px-4 py-2.5 font-mono text-xs text-gray-400 align-top">
        {fmtDelay(lot.delay_raw)}
      </td>
      <td className="px-4 py-2.5 text-gray-400 text-xs align-top whitespace-nowrap hidden sm:table-cell">
        {fmtDate(lot.delivery_date)}
      </td>
    </tr>
  )
}

// ── Sortable lot table ────────────────────────────────────────────────────────

function LotTable({ lots, isActive }) {
  const [sortKey, setSortKey] = useState(isActive ? 'delay_days' : 'delivery_date')
  const [sortDir, setSortDir] = useState('desc')

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(COL_DEFAULT_DIR[key] ?? 'asc')
    }
  }

  const sorted = useMemo(() => sortLots(lots, sortKey, sortDir), [lots, sortKey, sortDir])

  if (lots.length === 0) return <p className="text-sm text-gray-400 py-3">None.</p>

  const borderCls = isActive ? 'border-red-100'  : 'border-gray-200'
  const headerCls = isActive
    ? 'bg-red-50 text-red-400 border-b border-red-100'
    : 'bg-gray-50 text-gray-400 border-b border-gray-100'

  const thProps = { sortKey, sortDir, onSort: handleSort }

  return (
    <div className={`rounded-xl border overflow-hidden ${borderCls}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={`text-xs uppercase tracking-wide font-medium ${headerCls}`}>
            <Th col="lot_number"    className="w-24"                 {...thProps}>Lot</Th>
            <Th col="customer_name"                                  {...thProps}>Customer / Style</Th>
            <Th col="step_name"    className="hidden md:table-cell"  {...thProps}>Step / FMS</Th>
            <Th col="delay_days"                                     {...thProps}>
              {isActive ? 'Overdue' : 'Delay'}
            </Th>
            <Th col="delivery_date" className="hidden sm:table-cell" {...thProps}>Delivery</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((lot, i) =>
            isActive
              ? <ActiveLotRow  key={i} lot={lot} />
              : <HistoryLotRow key={i} lot={lot} />
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DrillDownPanel({ name, tab, daysBack, onBack }) {
  const { data, isLoading } = useDelayReport(daysBack)
  const [historyOpen, setHistoryOpen] = useState(true)

  // Escape key navigates back
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onBack])

  const list  = tab === 'doers' ? (data?.doers ?? []) : (data?.vendors ?? [])
  const row   = list.find(r => r.name === name)
  const label = tab === 'doers' ? 'Internal Doer' : 'Vendor'

  // Metric card values derived from row
  const worstDelay = row?.max_delay_days > 0 ? `+${row.max_delay_days}d` : '—'
  const worstColor = !row?.max_delay_days
    ? 'text-gray-300'
    : row.max_delay_days > 7 ? 'text-red-600' : 'text-orange-500'

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <header className="no-print bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors shrink-0"
            title="Back (Esc)"
          >
            ← Back
          </button>
          <div className="h-5 w-px bg-gray-200 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-gray-900 leading-tight truncate">{name}</h1>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{label}</span>
              {row && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className={row.active_lots_count > 0 ? 'text-red-600 font-medium' : ''}>
                    {plural(row.active_lots_count, 'active lot')} · {pcs(row.active_pieces)} pcs
                  </span>
                  <span className="text-gray-300">·</span>
                  <span>
                    {plural(row.history_lots_count, 'history lot')} · {pcs(row.history_pieces)} pcs
                  </span>
                  {row.active_lots_unknown_qty > 0 && (
                    <span
                      className="text-amber-600"
                      title={`${plural(row.active_lots_unknown_qty, 'active lot')} missing a qty; counted as 0 pcs`}
                    >
                      ⚠ {row.active_lots_unknown_qty} no qty
                    </span>
                  )}
                </>
              )}
              <span className="text-gray-300 hidden sm:inline">· Press Esc to go back</span>
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24 text-gray-400 text-sm gap-2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            Loading…
          </div>
        )}

        {row && (
          <>
            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard
                label={`Active lots · ${pcs(row.active_pieces)} pcs`}
                value={row.active_lots_count}
                sub={plural(row.active_lots.length, 'step')}
                valueColor={row.active_lots_count > 0 ? 'text-red-600' : 'text-gray-300'}
              />
              <MetricCard
                label="Worst delay"
                value={worstDelay}
                valueColor={worstColor}
              />
              <MetricCard
                label="Critical (>7d)"
                value={row.critical_count}
                valueColor={row.critical_count > 0 ? 'text-orange-600' : 'text-gray-300'}
              />
              <MetricCard
                label="Top bottleneck"
                value={row.top_bottleneck_step ?? 'None'}
              />
            </div>

            {/* Step breakdown — only when there are active fires */}
            {row.active_lots.length > 0 && (
              <StepBreakdown lots={row.active_lots} />
            )}

            {/* Active fires */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
                <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide">
                  Active fires
                </h2>
                <span className="text-xs text-gray-400">
                  {plural(row.active_lots_count, 'lot')} · {pcs(row.active_pieces)} pcs
                  {row.active_lots.length !== row.active_lots_count
                    ? ` · ${plural(row.active_lots.length, 'step')}`
                    : ''}
                  {row.critical_count > 0 && (
                    <span className="ml-2 text-red-500 font-medium">
                      {row.critical_count} critical
                    </span>
                  )}
                </span>
              </div>
              <LotTable lots={row.active_lots} isActive={true} />
            </section>

            {/* History (collapsible) */}
            <section>
              <button
                onClick={() => setHistoryOpen(o => !o)}
                className="flex items-center gap-2 mb-3 w-full text-left group"
              >
                <span className="w-2 h-2 rounded-full bg-gray-300 inline-block shrink-0" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide group-hover:text-gray-700 transition-colors">
                  History
                </h2>
                <span className="text-xs text-gray-400">
                  {plural(row.history_lots_count, 'lot')} · {pcs(row.history_pieces)} pcs
                  {row.history_lots.length !== row.history_lots_count
                    ? ` · ${plural(row.history_lots.length, 'step')}`
                    : ''}
                </span>
                <span className="ml-auto text-gray-400 text-xs group-hover:text-gray-600 transition-colors">
                  {historyOpen ? 'Collapse ▲' : 'Expand ▼'}
                </span>
              </button>
              {historyOpen && <LotTable lots={row.history_lots} isActive={false} />}
            </section>
          </>
        )}

        {!isLoading && !row && (
          <div className="text-center py-24 text-gray-400 text-sm">No data for this entry.</div>
        )}
      </main>
    </div>
  )
}
