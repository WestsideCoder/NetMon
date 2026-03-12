// SPDX-License-Identifier: GPL-3.0-or-later

export type UserRole = 'admin' | 'operator' | 'viewer';
export type AuthSource = 'local' | 'ldap';
export type DeviceStatus = 'online' | 'warning' | 'offline' | 'unknown';
export type DeviceType = 'ups' | 'switch' | 'router' | 'server' | 'camera' | 'access_point' | 'iot' | 'other';
export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  auth_source: AuthSource;
  is_active: boolean;
  must_change_password?: boolean;
  created_at: string;
  last_login: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface Device {
  id: number;
  name: string;
  ip_address: string;
  device_type: DeviceType | null;
  mac_address: string | null;
  site_id: number;
  site_name: string | null;
  vlan: string | null;
  status: DeviceStatus;
  status_reason: string | null;
  response_time: number | null;
  last_seen: string | null;
  last_check: string | null;
  consecutive_failures: number;
  total_checks: number;
  successful_checks: number;
  uptime_percentage: number;
  snmp_enabled: boolean;
  snmp_credential_id: number | null;
  snmp_template_id: number | null;
  http_url: string | null;
  http_response_time: number | null;
  ntp_enabled: boolean;
  web_check_enabled: boolean;
  ntp_offset_ms: number | null;
  ntp_rtt_ms: number | null;
  ntp_server_time: string | null;
  ntp_stratum: number | null;
  ntp_reference_id: string | null;
  os_info: string | null;
  maintenance_mode: boolean;
  maintenance_until: string | null;
  notes: string | null;
  map_x: number | null;
  map_y: number | null;
  created_at: string;
  updated_at: string;
}

export interface SNMPTemplate {
  id: number;
  name: string;
  device_type: string | null;
  description: string | null;
  enabled: boolean;
}

export interface DeviceListResponse {
  items: Device[];
  total: number;
  page: number;
  per_page: number;
}

export interface DeviceStats {
  total: number;
  online: number;
  warning: number;
  offline: number;
  unknown: number;
}

export interface Site {
  id: number;
  name: string;
  location: string | null;
  description: string | null;
  parent_site_id: number | null;
  level: number;
  contact_name: string | null;
  contact_email: string | null;
  map_image_url: string | null;
  map_config: string | null;
  map_x: number | null;
  map_y: number | null;
  device_count: number;
  created_at: string;
  updated_at: string;
}

export interface SiteTree {
  id: number;
  name: string;
  location: string | null;
  level: number;
  map_image_url: string | null;
  map_x: number | null;
  map_y: number | null;
  device_count: number;
  children: SiteTree[];
}

export interface SiteChildWithStats {
  id: number;
  name: string;
  location: string | null;
  level: number;
  map_image_url: string | null;
  map_x: number | null;
  map_y: number | null;
  device_stats: DeviceStats;
}

export interface MapImage {
  id: number;
  name: string;
  filename: string;
  file_path: string;
  file_size: number;
  content_type: string;
  uploaded_by: number | null;
  url: string;
  created_at: string;
}

export interface Alert {
  id: number;
  device_id: number;
  rule_id: number | null;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  metric_name: string | null;
  metric_value: string | null;
  triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  acknowledged_by: number | null;
}

export interface AlertRule {
  id: number;
  name: string;
  description: string | null;
  metric_name: string;
  condition: string;
  threshold: number;
  duration_seconds: number;
  severity: AlertSeverity;
  device_type: string | null;
  template_id: number | null;
  enabled: boolean;
  created_at: string;
}

export interface SNMPCredential {
  id: number;
  name: string;
  version: string;
  port: number;
  community: string | null;
  username: string | null;
  auth_protocol: string | null;
  priv_protocol: string | null;
  description: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SNMPMetricLatest {
  oid_name: string;
  value: string;
  value_type: string;
  timestamp: string;
}

export interface SNMPHistoryPoint {
  timestamp: string;
  value: string;
}

export interface SNMPDeviceData {
  device_id: number;
  device_type: string | null;
  template_name: string | null;
  latest: SNMPMetricLatest[];
  history: Record<string, SNMPHistoryPoint[]>;
}

export interface SNMPSummaryDevice {
  device_id: number;
  device_name: string;
  device_type: string | null;
  ip_address: string;
  status: string;
  key_metric_name: string | null;
  key_metric_value: string | null;
  key_metric_type: string | null;
}

export interface SSLCertificate {
  id: number;
  name: string;
  cert_type: 'ca' | 'server' | 'uploaded' | 'csr';
  common_name: string;
  subject_alt_names: string[] | null;
  issuer: string | null;
  serial_number: string | null;
  not_before: string | null;
  not_after: string | null;
  fingerprint_sha256: string | null;
  is_active: boolean;
  is_ca: boolean;
  has_csr: boolean;
  uploaded_by: number | null;
  created_at: string;
}

export interface SSLStatus {
  has_ca: boolean;
  active_ca: SSLCertificate | null;
  active_cert: SSLCertificate | null;
  nginx_reload_available: boolean;
}
