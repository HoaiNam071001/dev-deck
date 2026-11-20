import { useEffect, useState } from 'react'
import { GitPage } from './pages/GitPage'
import { TokenPage } from './pages/TokenPage'

const TABS = [
  { id: 'tokens', label: 'Token' },
  { id: 'git', label: 'Git' },
] as const
type Tab = (typeof TABS)[number]['id']

const fromHash = (): Tab => (location.hash.replace('#/', '') === 'git' ? 'git' : 'tokens')

export function App() {
  const [tab, setTab] = useState<Tab>(fromHash)
  useEffect(() => {
    const on = () => setTab(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { document.title = (tab === 'git' ? 'Git' : 'Token') + ' · DevDeck' }, [tab])

  return (
    <div className="wrap">
      <nav className="tabs" aria-label="Trang">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined}>{t.label}</a>
        ))}
      </nav>
      {tab === 'git' ? <GitPage /> : <TokenPage />}
    </div>
  )
}
