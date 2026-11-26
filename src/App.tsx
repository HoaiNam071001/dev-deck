import { Shell } from './components/Shell'
import { useRoute } from './lib/router'
import { GitPage } from './pages/GitPage'
import { HomePage } from './pages/HomePage'
import { TokenPage } from './pages/TokenPage'

export function App() {
  const route = useRoute()
  return <Shell>{route === '/git' ? <GitPage /> : route === '/ai' ? <TokenPage /> : <HomePage />}</Shell>
}
