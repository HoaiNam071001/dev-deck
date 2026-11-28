import { ErrorBoundary } from './components/ErrorBoundary'
import { Shell } from './components/Shell'
import { useAiDoneWatch } from './lib/aiWatch'
import { useScriptDoneWatch } from './lib/scriptWatch'
import { useJiraWatch } from './lib/jiraWatch'
import { useRemoteWatch } from './lib/remoteWatch'
import { useRoute } from './lib/router'
import { GitPage } from './pages/GitPage'
import { HomePage } from './pages/HomePage'
import { JiraPage } from './pages/JiraPage'
import { JobsPage } from './pages/JobsPage'
import { RemotesPage } from './pages/RemotesPage'
import { TokenPage } from './pages/TokenPage'

export function App() {
  const route = useRoute()
  useRemoteWatch()
  useJiraWatch()
  useAiDoneWatch()
  useScriptDoneWatch()
  return <Shell><ErrorBoundary resetKey={route}>{route === '/git' ? <GitPage /> : route === '/jobs' ? <JobsPage /> : route === '/remotes' ? <RemotesPage /> : route === '/jira' ? <JiraPage /> : route === '/ai' ? <TokenPage /> : <HomePage />}</ErrorBoundary></Shell>
}
