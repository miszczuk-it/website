export interface DashboardWeatherSnapshot {
  temperature_c: number
  humidity_pct: number
  pressure_hpa: number
  precipitation_mm: number
  wind_kph: number
  visibility_km: number
  condition_text: string | null
}

export interface DashboardCurrentStatus {
  location_id: string
  weather: DashboardWeatherSnapshot
  weather_observed_at: string
  weather_age_minutes: number
  traffic_available: boolean
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
