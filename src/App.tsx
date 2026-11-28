import { ErrorBoundary } from './components/ErrorBoundary'
import { Shell } from './components/Shell'
import { useRemoteWatch } from './lib/remoteWatch'
import { useRoute } from './lib/router'
import { GitPage } from './pages/GitPage'
import { HomePage } from './pages/HomePage'
import { JobsPage } from './pages/JobsPage'
import { RemotesPage } from './pages/RemotesPage'
import { TokenPage } from './pages/TokenPage'

export function App() {
  const route = useRoute()
  useRemoteWatch()
  return <Shell><ErrorBoundary resetKey={route}>{route === '/git' ? <GitPage /> : route === '/jobs' ? <JobsPage /> : route === '/remotes' ? <RemotesPage /> : route === '/ai' ? <TokenPage /> : <HomePage />}</ErrorBoundary></Shell>
}
