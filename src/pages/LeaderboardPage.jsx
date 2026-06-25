import { useState, useMemo, Fragment } from 'react'
import { useDelayReport } from '../hooks/useDelayReport'
import { useAuth } from '../context/AuthContext'

const DAY_OPTIONS = [
  { label: '30 d', value: 30 },
  { label: '90 d', value: 90 },
  { label: 'All',  value: null },
]

const SEVERITY_OPTIONS = [
  { id: 'all',      label: 'All' },
  { id: 'critical', label: 'Critical >7d' },
  { id: 'warning',  label: 'Warning 3–7d' },
]

const COLS = [
  { key: 'active_lots_count',  defaultDir: 'desc' },
  { key: 'max_delay_days',     defaultDir: 'desc' },
  { key: 'history_lots_count', defaultDir: 'desc' },
  { key: 'name',               defaultDir: 'asc'  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts) {
  if (!ts) return null
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)   return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function rowAccent(row) {
  if (row.active_lots_count === 0) return ''
  const d = row.max_delay_days || 0
  if (d > 7)  return 'border-l-[3px] border-l-red-500'
  if (d >= 3) return 'border-l-[3px] border-l-orange-400'
  return 'border-l-[3px] border-l-yellow-400'
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, valueColor = 'text-gray-900' }) {
  const isText = typeof value === 'string' && value.length > 4
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 flex flex-col justify-between min-w-0">
      <div className={`font-bold leading-none truncate ${isText ? 'text-sm text-gray-700' : `text-2xl ${valueColor}`}`}>
        {value ?? '—'}
      </div>
      <div className="text-xs text-gray-400 mt-2 leading-tight">{label}</div>
    </div>
  )
}

function DelayBadge({ days }) {
  if (!days || days <= 0) return <span className="text-gray-300">—</span>
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

function ActiveBadge({ count }) {
  if (count === 0) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-flex items-center justify-center min-w-[1.75rem] bg-red-100 text-red-700 font-bold rounded-full px-2 py-0.5 text-sm">
      {count}
    </span>
  )
}

function RankDisplay({ rank }) {
  const base = 'inline-flex items-center justify-center w-5 h-5 rounded-full text-white font-bold'
  if (rank === 1) return <span className={`${base} bg-yellow-400`} style={{ fontSize: 10 }}>1</span>
  if (rank === 2) return <span className={`${base} bg-gray-400`}   style={{ fontSize: 10 }}>2</span>
  if (rank === 3) return <span className={`${base} bg-amber-700`}  style={{ fontSize: 10 }}>3</span>
  return <span className="text-gray-300 text-xs">{rank}</span>
}

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) {
    return (
      <span className="inline-flex flex-col leading-none ml-1 opacity-25">
        <span style={{ fontSize: 8 }}>▲</span>
        <span style={{ fontSize: 8 }}>▼</span>
      </span>
    )
  }
  return (
    <span className="inline-block ml-1 text-blue-500" style={{ fontSize: 9 }}>
      {sortDir === 'asc' ? '▲' : '▼'}
    </span>
  )
}

function SkeletonRows() {
  return Array.from({ length: 6 }).map((_, i) => (
    <tr key={i} className="border-b border-gray-50">
      <td className="px-5 py-3.5"><div className="h-3 w-4 bg-gray-100 rounded animate-pulse" /></td>
      <td className="px-4 py-3.5"><div className="h-3 w-36 bg-gray-100 rounded animate-pulse" /></td>
      <td className="px-4 py-3.5"><div className="h-5 w-8 bg-gray-100 rounded-full animate-pulse mx-auto" /></td>
      <td className="px-4 py-3.5"><div className="h-5 w-10 bg-gray-100 rounded animate-pulse mx-auto" /></td>
      <td className="px-4 py-3.5 hidden sm:table-cell"><div className="h-3 w-6 bg-gray-100 rounded animate-pulse mx-auto" /></td>
      <td className="px-4 py-3.5 hidden lg:table-cell"><div className="h-3 w-28 bg-gray-100 rounded animate-pulse" /></td>
      <td className="px-4 py-3.5" />
    </tr>
  ))
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LeaderboardPage({ daysBack, onDaysBackChange, onDrillDown, onPrint }) {
  const { logout, user } = useAuth()
  const [tab,      setTab]      = useState('doers')
  const [search,   setSearch]   = useState('')
  const [severity, setSeverity] = useState('all')
  const [sortKey,  setSortKey]  = useState('max_delay_days')
  const [sortDir,  setSortDir]  = useState('desc')

  const handleSort = (key) => {
    const col = COLS.find(c => c.key === key)
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(col?.defaultDir ?? 'desc')
    }
  }

  const {
    data, isLoading, isError, error,
    dataUpdatedAt, refetch, isFetching,
  } = useDelayReport(daysBack)

  const allRows = tab === 'doers' ? (data?.doers ?? []) : (data?.vendors ?? [])

  const stats = useMemo(() => {
    const totalFires    = allRows.reduce((s, r) => s + r.active_lots_count, 0)
    const peopleOnFire  = allRows.filter(r => r.active_lots_count > 0).length
    const criticalCount = allRows.reduce((s, r) => s + (r.critical_count || 0), 0)
    const freq = {}
    allRows.forEach(r => {
      if (r.active_lots_count > 0 && r.top_bottleneck_step) {
        freq[r.top_bottleneck_step] = (freq[r.top_bottleneck_step] || 0) + 1
      }
    })
    const topStep = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return { totalFires, peopleOnFire, criticalCount, topStep }
  }, [allRows])

  const rows = useMemo(() => {
    const filtered = allRows
      .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))
      .filter(r => {
        const d = r.max_delay_days || 0
        if (severity === 'critical') return d > 7
        if (severity === 'warning')  return d >= 3 && d <= 7
        return true
      })
    return [...filtered].sort((a, b) => {
      let va = a[sortKey] ?? (sortKey === 'name' ? '' : 0)
      let vb = b[sortKey] ?? (sortKey === 'name' ? '' : 0)
      if (typeof va === 'string') {
        const cmp = va.localeCompare(vb)
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }, [allRows, search, severity, sortKey, sortDir])

  // Index where we draw the "no active fires" divider
  const firstZeroIdx = rows.findIndex(r => r.active_lots_count === 0)

  const updatedLabel = timeAgo(dataUpdatedAt)

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <header className="no-print bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="shrink-0">
            <h1 className="text-base font-semibold text-gray-900 leading-tight">Delay Report</h1>
            <p className="text-xs text-gray-400">Who&apos;s holding up lots</p>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-3 shrink-0">
            {updatedLabel && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <span>Updated {updatedLabel}</span>
                <button
                  onClick={() => refetch()}
                  disabled={isFetching}
                  title="Refresh now"
                  className="hover:text-gray-700 disabled:opacity-40 transition-colors text-base leading-none"
                >
                  {isFetching ? '…' : '↺'}
                </button>
              </div>
            )}
            {user?.full_name && (
              <span className="text-xs text-gray-400 hidden sm:block">{user.full_name}</span>
            )}
            <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-5 space-y-5">

        {/* ── Stat cards ── */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Active fires"
              value={stats.totalFires}
              valueColor={stats.totalFires > 0 ? 'text-red-600' : 'text-gray-300'}
            />
            <StatCard
              label={tab === 'doers' ? 'Doers with fires' : 'Vendors with fires'}
              value={stats.peopleOnFire}
              valueColor={stats.peopleOnFire > 0 ? 'text-gray-900' : 'text-gray-300'}
            />
            <StatCard
              label="Critical (>7 days)"
              value={stats.criticalCount}
              valueColor={stats.criticalCount > 0 ? 'text-orange-600' : 'text-gray-300'}
            />
            <StatCard
              label="Top bottleneck"
              value={stats.topStep ?? 'None'}
            />
          </div>
        )}

        {/* ── Controls ── */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tab */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            {[
              { id: 'doers',   label: 'Internal Doers' },
              { id: 'vendors', label: 'Vendors' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSearch(''); setSeverity('all') }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tab === t.id
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Period */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Period:</span>
            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
              {DAY_OPTIONS.map(opt => (
                <button
                  key={opt.value ?? 'all'}
                  onClick={() => onDaysBackChange(opt.value)}
                  className={`px-3 py-1 rounded-md text-sm transition-colors ${
                    daysBack === opt.value
                      ? 'bg-white shadow-sm text-gray-900 font-medium'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1" />

          {/* Severity */}
          <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
            {SEVERITY_OPTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSeverity(s.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  severity === s.id
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search name…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-7 py-1.5 text-sm border border-gray-200 rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-44"
            />
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ── Error ── */}
        {isError && (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
            <p className="text-red-500 text-sm font-medium">Could not load data</p>
            <p className="text-gray-400 text-xs mt-1">{error?.message}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* ── Table ── */}
        {!isError && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 bg-gray-50 text-gray-400 text-xs uppercase tracking-wide font-medium">
                    <th className="text-left px-5 py-3 w-10">#</th>
                    <th
                      className="text-left px-4 py-3 cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => handleSort('name')}
                    >
                      Name <SortIcon col="name" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th
                      className="text-center px-4 py-3 cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => handleSort('active_lots_count')}
                    >
                      Active <SortIcon col="active_lots_count" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th
                      className="text-center px-4 py-3 cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => handleSort('max_delay_days')}
                    >
                      Worst <SortIcon col="max_delay_days" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th
                      className="text-center px-4 py-3 hidden sm:table-cell cursor-pointer hover:text-gray-700 select-none"
                      onClick={() => handleSort('history_lots_count')}
                    >
                      History <SortIcon col="history_lots_count" sortKey={sortKey} sortDir={sortDir} />
                    </th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">Top Step</th>
                    <th className="px-4 py-3 w-24" />
                  </tr>
                </thead>

                <tbody>
                  {isLoading
                    ? <SkeletonRows />
                    : rows.length === 0
                    ? (
                      <tr>
                        <td colSpan={7} className="text-center py-20 text-gray-400 text-sm">
                          {search
                            ? `No results for "${search}"`
                            : severity !== 'all'
                            ? 'No entries match this severity filter.'
                            : 'No delays found for this period.'
                          }
                        </td>
                      </tr>
                    )
                    : rows.map((row, i) => (
                      <Fragment key={row.name}>
                        {/* Divider before "no fires" section */}
                        {i === firstZeroIdx && firstZeroIdx > 0 && (
                          <tr className="bg-gray-50/80">
                            <td colSpan={7} className="px-5 py-2 border-t border-b border-gray-100">
                              <span className="text-xs text-gray-400 font-medium tracking-wide uppercase">
                                No active fires
                              </span>
                            </td>
                          </tr>
                        )}

                        <tr
                          onClick={() => onDrillDown(row.name, tab)}
                          className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors
                            ${row.active_lots_count === 0 ? 'opacity-50 hover:opacity-80' : 'hover:bg-gray-50/80'}
                            ${rowAccent(row)}`}
                        >
                          <td className="px-5 py-3.5">
                            <RankDisplay rank={i + 1} />
                          </td>

                          <td className="px-4 py-3.5">
                            <span className="font-medium text-gray-900">{row.name}</span>
                            {row.critical_count > 0 && (
                              <span className="ml-2 text-xs text-red-500 font-medium">
                                {row.critical_count} critical
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            <ActiveBadge count={row.active_lots_count} />
                          </td>

                          <td className="px-4 py-3.5 text-center">
                            <DelayBadge days={row.max_delay_days} />
                          </td>

                          <td className="px-4 py-3.5 text-center text-gray-400 text-sm hidden sm:table-cell">
                            {row.history_lots_count || '—'}
                          </td>

                          <td className="px-4 py-3.5 text-gray-400 text-xs hidden lg:table-cell max-w-[180px] truncate">
                            {row.top_bottleneck_step || '—'}
                          </td>

                          <td
                            className="px-4 py-3.5 text-right whitespace-nowrap"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => onDrillDown(row.name, tab)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Details
                            </button>
                            {tab === 'doers' && (
                              <button
                                onClick={() => onPrint(row.name)}
                                className="text-xs text-gray-400 hover:text-gray-600 ml-3"
                              >
                                Print
                              </button>
                            )}
                          </td>
                        </tr>
                      </Fragment>
                    ))
                  }
                </tbody>
              </table>
            </div>

            {/* Footer */}
            {!isLoading && rows.length > 0 && (
              <div className="flex items-center gap-5 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-300 inline-block" />
                  Critical &gt;7d
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-300 inline-block" />
                  Warning 3–7d
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-yellow-300 inline-block" />
                  Active &lt;3d
                </span>
                <span className="ml-auto">
                  Showing {rows.length} of {allRows.length} {tab === 'doers' ? 'doers' : 'vendors'}
                  {' · '}Worst = days past planned date
                  {' · '}Auto-refreshes every 5 min
                </span>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
