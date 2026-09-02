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

// M5.7: hourly LOCAL aggregates + GOLD-computed deltas, joined server-side by hour onto the
// WeatherAPI point. All seven are absent together for any hour with no matching LOCAL row.
// There is no pressure delta field: GOLD never computes one (see dashboardApi.ts docs).
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
  local_temperature_avg_c: number | null
  temperature_delta_avg_c: number | null
  local_humidity_avg_pct: number | null
  humidity_delta_avg_pp: number | null
  local_pressure_avg_hpa: number | null
  local_light_avg_lux: number | null
  local_sample_count: number | null
}

// M5.7: GET /iot/v1/dashboard/device-status -- independent of DashboardCurrentStatus, polled on
// its own fast interval (see RoadMonitorPage.tsx). Sourced live from PostgreSQL telemetry_raw,
// never Databricks, never cached.
export interface DashboardDeviceStatus {
  device_id: string
  online: boolean
  last_telemetry_received_at: string | null
  last_seen_at?: string | null
}

export type TrafficRange = '24h' | '7d' | '30d'
export interface DashboardTrafficBucket { bucket_start: string; incoming_vehicles: number; outgoing_vehicles: number; avg_speed_kmh: number | null; max_speed_kmh: number | null }
export interface DashboardTrafficRecentPass { detected_at: string; direction: 'INCOMING' | 'OUTGOING'; speed_avg_kmh: number; speed_max_kmh: number; event_duration_ms: number }
export interface DashboardTrafficOverview { device_id: string; range: TrafficRange; from: string; to: string; total_vehicles: number; incoming_vehicles: number; outgoing_vehicles: number; avg_speed_kmh: number | null; max_speed_kmh: number | null; buckets: DashboardTrafficBucket[]; recent_passes: DashboardTrafficRecentPass[] }

// Shared 24h/7d range selector for the history charts (weather + ESP activity) on
// RoadMonitorPage -- kept as one type so both sections stay in sync with a single control.
export type HistoryRangeHours = 24 | 168

export interface DashboardWeatherHistory {
  location_id: string
  from: string
  to: string
  points: DashboardWeatherHourlyPoint[]
  data_status: 'fresh' | 'stale'
  last_databricks_success_at: string | null
  source_data_at: string | null
}

// M5.8: GET /iot/v1/dashboard/device-activity-hourly -- independent of DashboardWeatherHistory,
// same live-Postgres/no-cache rationale as DashboardDeviceStatus. One point per requested hour,
// zero-filled for an hour with no accepted telemetry upload (never omitted). upload_count counts
// accepted POST /iot/v1/telemetry requests persisted to telemetry_raw -- never a raw HTTP/TCP
// connection count.
export interface DashboardDeviceActivityHourlyPoint {
  hour_start: string
  upload_count: number
}

export interface DashboardDeviceActivityHourly {
  device_id: string
  from: string
  to: string
  points: DashboardDeviceActivityHourlyPoint[]
}
