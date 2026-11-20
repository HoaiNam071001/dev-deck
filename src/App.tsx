import { useEffect } from 'react'
import { Link, useRoute, type Route } from './lib/router'
import { GitPage } from './pages/GitPage'
import { HomePage } from './pages/HomePage'
import { TokenPage } from './pages/TokenPage'

const TABS: { to: Route; label: string; title: string }[] = [
  { to: '/', label: 'Trang chủ', title: 'DevDeck' },
  { to: '/claude', label: 'Claude', title: 'Claude' },
  { to: '/git', label: 'Git', title: 'Git' },
]

export function App() {
  const route = useRoute()
  useEffect(() => { document.title = (route === '/' ? '' : TABS.find((t) => t.to === route)!.title + ' · ') + 'DevDeck' }, [route])

  return (
    <div className="wrap">
      <nav className="tabs" aria-label="Trang">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} className={route === t.to ? 'active' : ''} aria-current={route === t.to ? 'page' : undefined}>{t.label}</Link>
        ))}
      </nav>
      {route === '/git' ? <GitPage /> : route === '/claude' ? <TokenPage /> : <HomePage />}
    </div>
  )
}
