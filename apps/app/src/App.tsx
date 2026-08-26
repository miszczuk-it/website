import { VerticalSliceWorkspace } from './components/VerticalSliceWorkspace.js'
import './styles.css'

function App() {
  return (
    <VerticalSliceWorkspace
      apiBaseUrl={import.meta.env.VITE_PLATFORM_API_URL ?? '/api'}
      apiEnabled={import.meta.env.VITE_PLATFORM_API_ENABLED === 'true'}
      appEnvironment={import.meta.env.VITE_APP_ENV ?? 'LOCAL'}
    />
  )
}

export default App
