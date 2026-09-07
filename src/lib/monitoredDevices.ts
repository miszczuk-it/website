// Single source of truth for the PROD device_id values the dashboard polls via
// /iot/v1/dashboard/device-status. This frontend has no DEV/PROD build split (VITE_IOT_API_URL
// always defaults to the production API -- see dashboardApi.ts), so a plain PROD list is
// sufficient; DEV ids (esp32-dev-001, esp32-radar-dev-001, esp32-cam-dev-001) must never appear
// here.
export const WEATHER_DEVICE_ID = 'road-001'
export const RADAR_DEVICE_ID = 'road-radar-001'
export const CAMERA_DEVICE_ID = 'road-cam-001'

export type MonitoredDeviceRole = 'weather' | 'radar' | 'camera'

export interface MonitoredDevice {
  id: string
  role: MonitoredDeviceRole
  label: string
}

export const MONITORED_DEVICES: MonitoredDevice[] = [
  { id: WEATHER_DEVICE_ID, role: 'weather', label: 'Stacja pogodowa' },
  { id: RADAR_DEVICE_ID, role: 'radar', label: 'Radar drogowy' },
  { id: CAMERA_DEVICE_ID, role: 'camera', label: 'ESP32-CAM' },
]
