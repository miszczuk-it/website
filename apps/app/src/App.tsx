import { AnalysisWorkspace } from './components/AnalysisWorkspace.js'
import './styles.css'

function App() {
  return (
    <AnalysisWorkspace
      apiBaseUrl={import.meta.env.VITE_PLATFORM_API_URL ?? '/api'}
      apiEnabled={import.meta.env.VITE_PLATFORM_API_ENABLED === 'true'}
    />
  )
}

export default App
