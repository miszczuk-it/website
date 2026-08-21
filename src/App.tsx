import { RouterProvider } from './router'
import { usePathname } from './lib/navigation'
import { HomePage } from './pages/HomePage'
import { RoadMonitorPage } from './pages/RoadMonitorPage'

function Routes() {
  const pathname = usePathname()

  if (pathname === '/road-monitor' || pathname === '/road-monitor/') return <RoadMonitorPage />
  return <HomePage />
}

function App() {
  return (
    <RouterProvider>
      <Routes />
    </RouterProvider>
  )
}

export default App
