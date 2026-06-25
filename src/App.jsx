import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import LeaderboardPage from './pages/LeaderboardPage'
import DrillDownPanel from './pages/DrillDownPanel'
import PrintWorksheet from './pages/PrintWorksheet'

// daysBack lives here so all three screens share the same react-query cache key.
// Navigating between screens never triggers a second API call.
function AppRoutes() {
  const { token } = useAuth()
  const [view, setView] = useState('leaderboard')          // 'leaderboard' | 'drilldown' | 'print'
  const [selected, setSelected] = useState(null)           // { name, tab }
  const [daysBack, setDaysBack] = useState(90)

  if (!token) return <LoginPage />

  if (view === 'drilldown') {
    return (
      <DrillDownPanel
        name={selected.name}
        tab={selected.tab}
        daysBack={daysBack}
        onBack={() => { setView('leaderboard'); setSelected(null) }}
      />
    )
  }

  if (view === 'print') {
    return (
      <PrintWorksheet
        name={selected.name}
        daysBack={daysBack}
        onBack={() => { setView('leaderboard'); setSelected(null) }}
      />
    )
  }

  return (
    <LeaderboardPage
      daysBack={daysBack}
      onDaysBackChange={setDaysBack}
      onDrillDown={(name, tab) => { setSelected({ name, tab }); setView('drilldown') }}
      onPrint={(name) => { setSelected({ name, tab: 'doers' }); setView('print') }}
    />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
