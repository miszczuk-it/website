export interface DashboardWeatherSnapshot {
  temperature_c: number
  humidity_pct: number
  pressure_hpa: number
  precipitation_mm: number
  wind_kph: number
  visibility_km: number
  condition_text: string | null
}

// M5.5: LOCAL (ESP32) versus WeatherAPI, both independent sources. Delta fields are computed
// in GOLD, never recomputed here. Absent (undefined) when the API predates this field's
// rollout -- callers should normalize via an all-null fallback rather than assuming presence.
export interface DashboardLocalComparison {
  local_temperature_c: number | null
  api_temperature_c: number | null
  temperature_delta_c: number | null
  local_humidity_percent: number | null
  api_humidity_percent: number | null
  humidity_delta_pp: number | null
  local_pressure_hpa: number | null
  api_pressure_hpa: number | null
  light_lux: number | null
  cloud_percent: number | null
  local_observed_at: string | null
}

export interface DashboardCurrentStatus {
  location_id: string
  weather: DashboardWeatherSnapshot
  weather_observed_at: string
  weather_age_minutes: number
  traffic_available: boolean
  local_comparison?: DashboardLocalComparison
  calculated_at: string
  data_status: 'fresh' | 'stale'
  last_databricks_success_at: string | null
  source_data_at: string | null
}

export interface DashboardWeatherHourlyPoint {
  observation_hour: string
  temperature_avg_c: number
  temperature_min_c: number
  temperature_max_c: number
  humidity_avg_pct: number
  pressure_avg_hpa: number
  precipitation_sum_mm: number
  wind_avg_kph: number
  visibility_avg_km: number
  condition_text: string | null
  source_row_count: number
}

export interface DashboardWeatherHistory {
  location_id: string
  from: string
  to: string
  points: DashboardWeatherHourlyPoint[]
  data_status: 'fresh' | 'stale'
  last_databricks_success_at: string | null
  source_data_at: string | null
}
