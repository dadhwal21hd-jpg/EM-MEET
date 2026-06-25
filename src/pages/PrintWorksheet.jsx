import { useDelayReport } from '../hooks/useDelayReport'

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

export default function PrintWorksheet({ name, daysBack, onBack }) {
  const { data, isLoading } = useDelayReport(daysBack)
  const doer = data?.doers?.find(d => d.name === name)

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  })

  const criticalLots  = (doer?.active_lots ?? []).filter(l => (l.delay_days || 0) > 7)
  const warningLots   = (doer?.active_lots ?? []).filter(l => (l.delay_days || 0) >= 3 && (l.delay_days || 0) <= 7)
  const normalLots    = (doer?.active_lots ?? []).filter(l => !l.delay_days || l.delay_days < 3)

  return (
    <>
      {/* Screen-only toolbar */}
      <div className="no-print bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          ← Back to Leaderboard
        </button>
        <button
          onClick={() => window.print()}
          className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg
                     hover:bg-gray-700 transition-colors"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Printable content */}
      <div className="worksheet max-w-3xl mx-auto px-8 py-10">
        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}

        {doer && (
          <>
            {/* Sheet header */}
            <div className="mb-8 pb-5 border-b-2 border-gray-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
                    Delay Report — Action Required
                  </p>
                  <h1 className="text-2xl font-bold text-gray-900 leading-tight">{doer.name}</h1>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-400">{today}</p>
                  {doer.active_lots_count > 0 && (
                    <p className="text-sm font-semibold text-red-600 mt-1">
                      {doer.active_lots_count} active {doer.active_lots_count === 1 ? 'lot' : 'lots'}
                      {doer.max_delay_days > 0 && ` · worst +${doer.max_delay_days}d`}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {doer.active_lots.length === 0 ? (
              <p className="text-sm text-gray-500">No active delayed lots at this time.</p>
            ) : (
              <>
                {/* Critical section */}
                {criticalLots.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-red-600 mb-2">
                      Critical — over 7 days overdue ({criticalLots.length})
                    </p>
                    <LotTable lots={criticalLots} />
                  </div>
                )}

                {/* Warning section */}
                {warningLots.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-2">
                      Warning — 3 to 7 days overdue ({warningLots.length})
                    </p>
                    <LotTable lots={warningLots} />
                  </div>
                )}

                {/* Normal section */}
                {normalLots.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">
                      Active — under 3 days ({normalLots.length})
                    </p>
                    <LotTable lots={normalLots} />
                  </div>
                )}
              </>
            )}

            {/* Screen-only footer */}
            <p className="no-print mt-8 text-xs text-gray-300">
              {doer.active_lots.length} step{doer.active_lots.length !== 1 ? 's' : ''}
              {' across '}
              {doer.active_lots_count} lot{doer.active_lots_count !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>
    </>
  )
}

function LotTable({ lots }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b-2 border-gray-800">
          <th className="text-left py-1.5 pr-4 font-semibold text-gray-800 w-24 text-xs">Lot</th>
          <th className="text-left py-1.5 pr-4 font-semibold text-gray-800 text-xs">Customer</th>
          <th className="text-left py-1.5 pr-4 font-semibold text-gray-800 text-xs hidden sm:table-cell">Style</th>
          <th className="text-left py-1.5 pr-4 font-semibold text-gray-800 text-xs">Step</th>
          <th className="text-left py-1.5 pr-4 font-semibold text-gray-800 text-xs">Overdue</th>
          <th className="text-left py-1.5 font-semibold text-gray-800 text-xs">Delivery</th>
        </tr>
      </thead>
      <tbody>
        {lots.map((lot, i) => (
          <tr key={i} className="border-b border-gray-200">
            <td className="py-2 pr-4 font-mono text-xs text-gray-700 align-top">
              {lot.lot_number || '—'}
            </td>
            <td className="py-2 pr-4 text-gray-900 align-top text-xs">
              <div>{lot.customer_name || '—'}</div>
              {lot.colour && <div className="text-gray-400">{lot.colour}</div>}
            </td>
            <td className="py-2 pr-4 text-gray-600 text-xs align-top hidden sm:table-cell">
              {lot.style_num || '—'}
              {lot.qty ? <span className="text-gray-400"> · {lot.qty}pc</span> : ''}
            </td>
            <td className="py-2 pr-4 text-gray-700 text-xs align-top">
              <div>{lot.step_name || '—'}</div>
              <div className="text-gray-400">{lot.fms_name || ''}</div>
            </td>
            <td className="py-2 pr-4 font-mono text-xs align-top">
              {lot.delay_days
                ? <span className={lot.delay_days > 7 ? 'text-red-700 font-bold' : 'text-orange-600 font-semibold'}>
                    +{lot.delay_days}d
                  </span>
                : <span className="text-gray-500">{fmtDelay(lot.delay_raw)}</span>
              }
            </td>
            <td className="py-2 text-gray-500 text-xs align-top">
              {fmtDate(lot.delivery_date)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
