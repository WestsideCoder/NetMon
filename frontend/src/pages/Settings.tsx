// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect } from 'react';
import { Activity, Radio, Bell, Users, Mail, Shield, ChevronRight, Server } from 'lucide-react';
import { useRole } from '../hooks/useRole';
import api from '../api/client';
import type { User, SNMPCredential } from '../types';
import ConfirmDialog from '../components/Common/ConfirmDialog';
import UserForm from '../components/Settings/UserForm';
import SSLSettings from '../components/Settings/SSLSettings';

interface MonitoringSettings {
  ping_interval: number;
  snmp_poll_interval: number;
  http_check_interval: number;
  missed_pings_warning: number;
  missed_pings_critical: number;
  cpu_warning_percent: number;
  cpu_critical_percent: number;
  memory_warning_percent: number;
  memory_critical_percent: number;
  disk_warning_percent: number;
  disk_critical_percent: number;
  dns_servers: string;
}

type SNMPVersion = 'v1' | 'v2c' | 'v3';

interface SNMPFormData {
  name: string;
  version: SNMPVersion;
  port: number;
  community: string;
  username: string;
  auth_protocol: string;
  auth_password: string;
  priv_protocol: string;
  priv_password: string;
  description: string;
}

interface NotificationChannel {
  id: number;
  name: string;
  channel_type: string;
  config: string;
  enabled: boolean;
  created_at: string;
}

interface ChannelFormData {
  name: string;
  channel_type: string;
  to: string;
  url: string;
  enabled: boolean;
}

const emptySNMPForm: SNMPFormData = {
  name: '', version: 'v2c', port: 161, community: '', username: '',
  auth_protocol: '', auth_password: '', priv_protocol: '', priv_password: '', description: '',
};

const emptyChannelForm: ChannelFormData = {
  name: '', channel_type: 'email', to: '', url: '', enabled: true,
};

interface SmtpSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_from: string;
  smtp_use_tls: boolean;
}

interface DhcpSettings {
  dhcp_enabled: boolean;
  dhcp_servers: string;
  dhcp_username: string;
  dhcp_password: string;
  dhcp_use_ssl: boolean;
  dhcp_auth: string;
  dhcp_sync_interval: number;
}

type Section = 'monitoring' | 'snmp' | 'notifications' | 'email' | 'users' | 'ssl' | 'dhcp';

const sections: { key: Section; label: string; icon: typeof Activity }[] = [
  { key: 'monitoring', label: 'Monitoring', icon: Activity },
  { key: 'snmp', label: 'SNMP', icon: Radio },
  { key: 'dhcp', label: 'DHCP Sync', icon: Server },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'email', label: 'Email Server', icon: Mail },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'ssl', label: 'SSL / TLS', icon: Shield },
];

export default function Settings() {
  const { isAdmin } = useRole();
  const [activeSection, setActiveSection] = useState<Section>('monitoring');
  const [users, setUsers] = useState<User[]>([]);
  const [mon, setMon] = useState<MonitoringSettings | null>(null);
  const [monSaving, setMonSaving] = useState(false);
  const [monMsg, setMonMsg] = useState('');

  // SNMP credential state
  const [creds, setCreds] = useState<SNMPCredential[]>([]);
  const [showSNMPForm, setShowSNMPForm] = useState(false);
  const [snmpEditId, setSNMPEditId] = useState<number | null>(null);
  const [snmpForm, setSNMPForm] = useState<SNMPFormData>({ ...emptySNMPForm });
  const [snmpSaving, setSNMPSaving] = useState(false);
  const [snmpError, setSNMPError] = useState('');
  const [snmpDeleteTarget, setSNMPDeleteTarget] = useState<SNMPCredential | null>(null);

  // Notification channel state
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [channelEditId, setChannelEditId] = useState<number | null>(null);
  const [channelForm, setChannelForm] = useState<ChannelFormData>({ ...emptyChannelForm });
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelError, setChannelError] = useState('');
  const [channelDeleteTarget, setChannelDeleteTarget] = useState<NotificationChannel | null>(null);

  // User management state
  const [showUserForm, setShowUserForm] = useState(false);
  const [userEditTarget, setUserEditTarget] = useState<User | undefined>(undefined);
  const [userDeleteTarget, setUserDeleteTarget] = useState<User | null>(null);

  // DHCP state
  const [dhcp, setDhcp] = useState<DhcpSettings | null>(null);
  const [dhcpSaving, setDhcpSaving] = useState(false);
  const [dhcpMsg, setDhcpMsg] = useState('');
  const [dhcpSyncing, setDhcpSyncing] = useState(false);
  const [dhcpSyncMsg, setDhcpSyncMsg] = useState('');
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvMsg, setCsvMsg] = useState('');

  // Email/SMTP state
  const [smtp, setSmtp] = useState<SmtpSettings | null>(null);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const loadCreds = () => {
    api.get('/api/snmp/credentials').then((r) => setCreds(r.data)).catch(() => {});
  };

  const loadChannels = () => {
    api.get('/api/alerts/channels').then((r) => setChannels(r.data)).catch(() => {});
  };

  const loadUsers = () => {
    api.get('/api/users/').then((r) => setUsers(r.data)).catch(() => {});
  };

  const loadSmtp = () => {
    api.get('/api/settings/email').then((r) => setSmtp(r.data)).catch(() => {});
  };

  useEffect(() => {
    loadUsers();
    api.get('/api/settings/monitoring').then((r) => setMon(r.data)).catch(() => {});
    loadCreds();
    loadChannels();
    loadSmtp();
    api.get('/api/settings/dhcp').then((r) => setDhcp(r.data)).catch(() => {});
  }, []);

  // Monitoring save
  const saveMon = async () => {
    if (!mon) return;
    setMonSaving(true);
    setMonMsg('');
    try {
      await api.put('/api/settings/monitoring', mon);
      setMonMsg('Settings saved successfully');
      setTimeout(() => setMonMsg(''), 3000);
    } catch {
      setMonMsg('Failed to save settings');
    } finally {
      setMonSaving(false);
    }
  };

  const setField = (field: keyof MonitoringSettings, value: number) =>
    setMon((m) => m ? { ...m, [field]: value } : m);

  // DHCP save
  const saveDhcp = async () => {
    if (!dhcp) return;
    setDhcpSaving(true);
    setDhcpMsg('');
    try {
      const res = await api.put('/api/settings/dhcp', dhcp);
      setDhcp(res.data);
      setDhcpMsg('Settings saved successfully');
      setTimeout(() => setDhcpMsg(''), 3000);
    } catch {
      setDhcpMsg('Failed to save settings');
    } finally {
      setDhcpSaving(false);
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    setCsvMsg('');
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await api.post('/api/settings/dhcp/import-csv', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setCsvMsg(res.data.message);
    } catch {
      setCsvMsg('Failed to import CSV');
    } finally {
      setCsvUploading(false);
      e.target.value = '';
    }
  };

  const triggerDhcpSync = async () => {
    setDhcpSyncing(true);
    setDhcpSyncMsg('');
    try {
      const res = await api.post('/api/settings/dhcp/sync');
      setDhcpSyncMsg(res.data.message);
    } catch {
      setDhcpSyncMsg('Failed to trigger sync');
    } finally {
      setDhcpSyncing(false);
    }
  };

  // SNMP credential handlers
  const openAddSNMP = () => {
    setSNMPEditId(null);
    setSNMPForm({ ...emptySNMPForm });
    setSNMPError('');
    setShowSNMPForm(true);
  };

  const openEditSNMP = (c: SNMPCredential) => {
    setSNMPEditId(c.id);
    setSNMPForm({
      name: c.name, version: c.version as SNMPVersion, port: c.port,
      community: '', username: c.username || '',
      auth_protocol: c.auth_protocol || '', auth_password: '',
      priv_protocol: c.priv_protocol || '', priv_password: '',
      description: c.description || '',
    });
    setSNMPError('');
    setShowSNMPForm(true);
  };

  const handleSaveSNMP = async () => {
    if (!snmpForm.name.trim()) { setSNMPError('Name is required'); return; }
    if (snmpForm.version !== 'v3' && !snmpForm.community.trim() && !snmpEditId) {
      setSNMPError('Community string is required for v1/v2c'); return;
    }
    if (snmpForm.version === 'v3' && !snmpForm.username.trim() && !snmpEditId) {
      setSNMPError('Username is required for SNMPv3'); return;
    }
    setSNMPSaving(true);
    setSNMPError('');
    const payload: Record<string, unknown> = {
      name: snmpForm.name, version: snmpForm.version, port: snmpForm.port,
      description: snmpForm.description || null,
    };
    if (snmpForm.version === 'v3') {
      if (snmpForm.username) payload.username = snmpForm.username;
      if (snmpForm.auth_protocol) payload.auth_protocol = snmpForm.auth_protocol;
      if (snmpForm.auth_password) payload.auth_password = snmpForm.auth_password;
      if (snmpForm.priv_protocol) payload.priv_protocol = snmpForm.priv_protocol;
      if (snmpForm.priv_password) payload.priv_password = snmpForm.priv_password;
      payload.community = null;
    } else {
      if (snmpForm.community) payload.community = snmpForm.community;
      payload.username = null; payload.auth_protocol = null;
      payload.auth_password = null; payload.priv_protocol = null; payload.priv_password = null;
    }
    try {
      if (snmpEditId) {
        await api.put(`/api/snmp/credentials/${snmpEditId}`, payload);
      } else {
        await api.post('/api/snmp/credentials', payload);
      }
      setShowSNMPForm(false);
      loadCreds();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setSNMPError(msg || 'Failed to save credential');
    } finally {
      setSNMPSaving(false);
    }
  };

  const handleDeleteSNMP = async () => {
    if (!snmpDeleteTarget) return;
    try {
      await api.delete(`/api/snmp/credentials/${snmpDeleteTarget.id}`);
      setSNMPDeleteTarget(null);
      loadCreds();
    } catch {
      setSNMPDeleteTarget(null);
    }
  };

  const setSNMPField = (field: keyof SNMPFormData, value: string | number) =>
    setSNMPForm((f) => ({ ...f, [field]: value }));

  // Notification channel handlers
  const openAddChannel = () => {
    setChannelEditId(null);
    setChannelForm({ ...emptyChannelForm });
    setChannelError('');
    setShowChannelForm(true);
  };

  const openEditChannel = (ch: NotificationChannel) => {
    setChannelEditId(ch.id);
    let to = '', url = '';
    try {
      const cfg = JSON.parse(ch.config);
      to = cfg.to || '';
      url = cfg.url || '';
    } catch { /* empty */ }
    setChannelForm({
      name: ch.name, channel_type: ch.channel_type,
      to, url, enabled: ch.enabled,
    });
    setChannelError('');
    setShowChannelForm(true);
  };

  const handleSaveChannel = async () => {
    if (!channelForm.name.trim()) { setChannelError('Name is required'); return; }
    if (channelForm.channel_type === 'email' && !channelForm.to.trim()) {
      setChannelError('Email address is required'); return;
    }
    if (channelForm.channel_type !== 'email' && !channelForm.url.trim()) {
      setChannelError('Webhook URL is required'); return;
    }
    setChannelSaving(true);
    setChannelError('');
    const config = channelForm.channel_type === 'email'
      ? JSON.stringify({ to: channelForm.to })
      : JSON.stringify({ url: channelForm.url });
    const payload = {
      name: channelForm.name,
      channel_type: channelForm.channel_type,
      config,
      enabled: channelForm.enabled,
    };
    try {
      if (channelEditId) {
        await api.put(`/api/alerts/channels/${channelEditId}`, payload);
      } else {
        await api.post('/api/alerts/channels', payload);
      }
      setShowChannelForm(false);
      loadChannels();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setChannelError(msg || 'Failed to save channel');
    } finally {
      setChannelSaving(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!channelDeleteTarget) return;
    try {
      await api.delete(`/api/alerts/channels/${channelDeleteTarget.id}`);
      setChannelDeleteTarget(null);
      loadChannels();
    } catch {
      setChannelDeleteTarget(null);
    }
  };

  // User management handlers
  const openAddUser = () => {
    setUserEditTarget(undefined);
    setShowUserForm(true);
  };

  const openEditUser = (u: User) => {
    setUserEditTarget(u);
    setShowUserForm(true);
  };

  const handleUserFormSuccess = () => {
    setShowUserForm(false);
    setUserEditTarget(undefined);
    loadUsers();
  };

  const handleDeleteUser = async () => {
    if (!userDeleteTarget) return;
    try {
      await api.delete(`/api/users/${userDeleteTarget.id}`);
      setUserDeleteTarget(null);
      loadUsers();
    } catch {
      setUserDeleteTarget(null);
    }
  };

  // SMTP handlers
  const saveSmtp = async () => {
    if (!smtp) return;
    setSmtpSaving(true);
    setSmtpMsg('');
    try {
      await api.put('/api/settings/email', smtp);
      setSmtpMsg('Email settings saved successfully');
      setTimeout(() => setSmtpMsg(''), 3000);
    } catch {
      setSmtpMsg('Failed to save email settings');
    } finally {
      setSmtpSaving(false);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail.trim()) { setTestMsg('Enter a recipient email address'); return; }
    setTestSending(true);
    setTestMsg('');
    try {
      const res = await api.post('/api/settings/email/test', { to: testEmail });
      setTestMsg(res.data.success ? 'Test email sent successfully!' : `Failed: ${res.data.message}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setTestMsg(msg || 'Failed to send test email');
    } finally {
      setTestSending(false);
      setTimeout(() => setTestMsg(''), 5000);
    }
  };

  const setSmtpField = (field: keyof SmtpSettings, value: string | number | boolean) =>
    setSmtp((s) => s ? { ...s, [field]: value } : s);

  const inputClass = 'w-full border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500' + (!isAdmin ? ' opacity-60 cursor-not-allowed' : '');
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 shrink-0">
          <nav className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            {sections.map((s) => {
              const Icon = s.icon;
              const active = activeSection === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                    active
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-l-3 border-blue-600'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{s.label}</span>
                  {active && <ChevronRight className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content panel */}
        <div className="flex-1 min-w-0">
          {/* ── Monitoring ── */}
          {activeSection === 'monitoring' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-5 py-4 border-b dark:border-gray-700">
                <h2 className="text-lg font-semibold dark:text-white">Ping & Monitoring</h2>
                <p className="text-xs text-gray-500 mt-0.5">Configure ping intervals and failure thresholds</p>
              </div>
              {mon && (
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={labelClass}>Ping Interval (seconds)</label>
                      <input type="number" min={5} className={inputClass} value={mon.ping_interval}
                        disabled={!isAdmin}
                        onChange={(e) => setField('ping_interval', parseInt(e.target.value) || 60)} />
                      <p className="text-xs text-gray-400 mt-1">How often to ping each device</p>
                    </div>
                    <div>
                      <label className={labelClass}>Missed Pings for Warning</label>
                      <input type="number" min={1} className={inputClass} value={mon.missed_pings_warning}
                        disabled={!isAdmin}
                        onChange={(e) => setField('missed_pings_warning', parseInt(e.target.value) || 2)} />
                      <p className="text-xs text-gray-400 mt-1">Consecutive misses before yellow status</p>
                    </div>
                    <div>
                      <label className={labelClass}>Missed Pings for Critical</label>
                      <input type="number" min={1} className={inputClass} value={mon.missed_pings_critical}
                        disabled={!isAdmin}
                        onChange={(e) => setField('missed_pings_critical', parseInt(e.target.value) || 3)} />
                      <p className="text-xs text-gray-400 mt-1">Consecutive misses before red status</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>SNMP Poll Interval (seconds)</label>
                      <input type="number" min={30} className={inputClass} value={mon.snmp_poll_interval}
                        disabled={!isAdmin}
                        onChange={(e) => setField('snmp_poll_interval', parseInt(e.target.value) || 300)} />
                    </div>
                    <div>
                      <label className={labelClass}>HTTP Check Interval (seconds)</label>
                      <input type="number" min={10} className={inputClass} value={mon.http_check_interval}
                        disabled={!isAdmin}
                        onChange={(e) => setField('http_check_interval', parseInt(e.target.value) || 120)} />
                    </div>
                  </div>

                  <div className="border-t dark:border-gray-700 pt-4 mt-2">
                    <h3 className="text-sm font-semibold dark:text-white mb-3">Server Metric Thresholds</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Devices will be set to Warning or Offline when SNMP metrics exceed these thresholds</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <label className={labelClass}>CPU Warning %</label>
                        <input type="number" min={1} max={100} className={inputClass} value={mon.cpu_warning_percent}
                          disabled={!isAdmin}
                          onChange={(e) => setField('cpu_warning_percent', parseInt(e.target.value) || 90)} />
                      </div>
                      <div>
                        <label className={labelClass}>CPU Critical %</label>
                        <input type="number" min={1} max={100} className={inputClass} value={mon.cpu_critical_percent}
                          disabled={!isAdmin}
                          onChange={(e) => setField('cpu_critical_percent', parseInt(e.target.value) || 95)} />
                      </div>
                      <div className="hidden sm:block" />
                      <div>
                        <label className={labelClass}>Memory Warning %</label>
                        <input type="number" min={1} max={100} className={inputClass} value={mon.memory_warning_percent}
                          disabled={!isAdmin}
                          onChange={(e) => setField('memory_warning_percent', parseInt(e.target.value) || 90)} />
                      </div>
                      <div>
                        <label className={labelClass}>Memory Critical %</label>
                        <input type="number" min={1} max={100} className={inputClass} value={mon.memory_critical_percent}
                          disabled={!isAdmin}
                          onChange={(e) => setField('memory_critical_percent', parseInt(e.target.value) || 95)} />
                      </div>
                      <div className="hidden sm:block" />
                      <div>
                        <label className={labelClass}>Disk Warning %</label>
                        <input type="number" min={1} max={100} className={inputClass} value={mon.disk_warning_percent}
                          disabled={!isAdmin}
                          onChange={(e) => setField('disk_warning_percent', parseInt(e.target.value) || 90)} />
                      </div>
                      <div>
                        <label className={labelClass}>Disk Critical %</label>
                        <input type="number" min={1} max={100} className={inputClass} value={mon.disk_critical_percent}
                          disabled={!isAdmin}
                          onChange={(e) => setField('disk_critical_percent', parseInt(e.target.value) || 95)} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">DNS Servers</h4>
                    <input type="text" className={inputClass} value={mon.dns_servers}
                      disabled={!isAdmin}
                      placeholder="e.g. 10.44.1.20,10.44.1.22"
                      onChange={(e) => setMon({ ...mon, dns_servers: e.target.value })} />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Comma-separated DNS servers for reverse lookups (device name resolution). Leave empty to use system DNS.</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400">
                    <p>Ping every <strong className="dark:text-gray-200">{mon.ping_interval}s</strong>,
                      warning after <strong className="dark:text-gray-200">{mon.missed_pings_warning * mon.ping_interval}s</strong> ({mon.missed_pings_warning} missed),
                      critical after <strong className="dark:text-gray-200">{mon.missed_pings_critical * mon.ping_interval}s</strong> ({mon.missed_pings_critical} missed).
                    </p>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-3">
                      <button onClick={saveMon} disabled={monSaving}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {monSaving ? 'Saving...' : 'Save Settings'}
                      </button>
                      {monMsg && (
                        <span className={`text-sm ${monMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{monMsg}</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── DHCP Sync ── */}
          {activeSection === 'dhcp' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-5 py-4 border-b dark:border-gray-700">
                <h2 className="text-lg font-semibold dark:text-white">DHCP Name Sync</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Automatically pull device hostnames from Windows DHCP Server via PowerShell remoting (WinRM).
                </p>
              </div>
              {dhcp && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={dhcp.dhcp_enabled}
                        disabled={!isAdmin}
                        onChange={(e) => setDhcp({ ...dhcp, dhcp_enabled: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable DHCP Sync</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DHCP Servers</label>
                      <input type="text" className={inputClass} value={dhcp.dhcp_servers}
                        disabled={!isAdmin}
                        placeholder="e.g. 10.44.1.10, 10.44.2.10, 10.44.3.10"
                        onChange={(e) => setDhcp({ ...dhcp, dhcp_servers: e.target.value })} />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Comma-separated list of DHCP server IPs or hostnames.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sync Interval (seconds)</label>
                      <input type="number" className={inputClass} value={dhcp.dhcp_sync_interval}
                        disabled={!isAdmin} min={300}
                        onChange={(e) => setDhcp({ ...dhcp, dhcp_sync_interval: parseInt(e.target.value) || 3600 })} />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">How often to sync (min 300s). Default: 3600s (1 hour).</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                      <input type="text" className={inputClass} value={dhcp.dhcp_username}
                        disabled={!isAdmin}
                        placeholder="DOMAIN\\username or username@domain.com"
                        onChange={(e) => setDhcp({ ...dhcp, dhcp_username: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                      <input type="password" className={inputClass} value={dhcp.dhcp_password}
                        disabled={!isAdmin}
                        placeholder={dhcp.dhcp_password === '****' ? '(unchanged)' : 'Enter password'}
                        onChange={(e) => setDhcp({ ...dhcp, dhcp_password: e.target.value })} />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={dhcp.dhcp_use_ssl}
                        disabled={!isAdmin}
                        onChange={(e) => setDhcp({ ...dhcp, dhcp_use_ssl: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Use SSL (port 5986)</span>
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Uncheck for HTTP (port 5985). SSL is recommended.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Authentication Method</label>
                    <select className={inputClass} value={dhcp.dhcp_auth}
                      disabled={!isAdmin}
                      onChange={(e) => setDhcp({ ...dhcp, dhcp_auth: e.target.value })}>
                      <option value="ntlm">NTLM</option>
                      <option value="negotiate">Negotiate (Kerberos/NTLM)</option>
                      <option value="kerberos">Kerberos</option>
                      <option value="credssp">CredSSP</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">NTLM works best for domain accounts connecting from Linux. Use Negotiate if Kerberos is configured.</p>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-xs text-gray-600 dark:text-gray-400">
                    <p><strong>Requirements:</strong> WinRM must be enabled on the DHCP server. The account needs DHCP Reader permissions.
                    Run <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">Enable-PSRemoting -Force</code> on the DHCP server if not already configured.</p>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <button onClick={saveDhcp} disabled={dhcpSaving}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {dhcpSaving ? 'Saving...' : 'Save Settings'}
                      </button>
                      <button onClick={triggerDhcpSync} disabled={dhcpSyncing || !dhcp.dhcp_enabled}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                        {dhcpSyncing ? 'Syncing...' : 'Sync Now'}
                      </button>
                      {dhcpMsg && (
                        <span className={`text-sm ${dhcpMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{dhcpMsg}</span>
                      )}
                      {dhcpSyncMsg && (
                        <span className={`text-sm ${dhcpSyncMsg.includes('failed') || dhcpSyncMsg.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>{dhcpSyncMsg}</span>
                      )}
                    </div>
                  )}

                  <div className="border-t dark:border-gray-700 pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CSV Import (Alternative)</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Upload a CSV with IP and Hostname columns. Export from DHCP server with: <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">Get-DhcpServerv4Lease -ScopeId X | Export-Csv leases.csv</code>
                    </p>
                    {isAdmin && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <label className="px-4 py-2 text-sm font-medium text-white bg-gray-600 rounded-lg hover:bg-gray-700 cursor-pointer disabled:opacity-50">
                          {csvUploading ? 'Uploading...' : 'Upload CSV'}
                          <input type="file" accept=".csv" className="hidden" onChange={handleCsvImport} disabled={csvUploading} />
                        </label>
                        {csvMsg && (
                          <span className={`text-sm ${csvMsg.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>{csvMsg}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SNMP ── */}
          {activeSection === 'snmp' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-5 py-4 border-b dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold dark:text-white">SNMP Credentials</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{creds.length} credential{creds.length !== 1 ? 's' : ''} configured</p>
                </div>
                {isAdmin && (
                  <button onClick={openAddSNMP}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    + Add Credential
                  </button>
                )}
              </div>
              <div className="divide-y dark:divide-gray-700">
                {creds.map((c) => (
                  <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium dark:text-white">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        {c.version.toUpperCase()} - Port {c.port}
                        {c.community && ` - Community: ${c.community}`}
                        {c.username && ` - User: ${c.username}`}
                      </p>
                      {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${c.enabled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                        {c.enabled ? 'Active' : 'Disabled'}
                      </span>
                      {isAdmin && (
                        <>
                          <button onClick={() => openEditSNMP(c)}
                            className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 rounded">Edit</button>
                          <button onClick={() => setSNMPDeleteTarget(c)}
                            className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-gray-700 rounded">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {creds.length === 0 && (
                  <p className="px-5 py-8 text-sm text-gray-400 text-center">
                    No credentials configured. Click "+ Add Credential" to create one.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeSection === 'notifications' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-5 py-4 border-b dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold dark:text-white">Notification Channels</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Configure email and webhook notifications for alerts</p>
                </div>
                {isAdmin && (
                  <button onClick={openAddChannel}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    + Add Channel
                  </button>
                )}
              </div>
              <div className="divide-y dark:divide-gray-700">
                {channels.map((ch) => {
                  let detail = '';
                  try {
                    const cfg = JSON.parse(ch.config);
                    detail = cfg.to || cfg.url || '';
                  } catch { /* empty */ }
                  return (
                    <div key={ch.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium dark:text-white">{ch.name}</p>
                        <p className="text-xs text-gray-500">
                          {ch.channel_type === 'email' ? 'Email' : ch.channel_type === 'slack' ? 'Slack' : 'Webhook'}
                          {detail && ` - ${detail}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${ch.enabled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {ch.enabled ? 'Active' : 'Disabled'}
                        </span>
                        {isAdmin && (
                          <>
                            <button onClick={() => openEditChannel(ch)}
                              className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 rounded">Edit</button>
                            <button onClick={() => setChannelDeleteTarget(ch)}
                              className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-gray-700 rounded">Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {channels.length === 0 && (
                  <div className="px-5 py-8 text-center">
                    <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No notification channels configured.</p>
                    <p className="text-xs text-gray-400 mt-1">Add an email or webhook channel to receive alert notifications.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Email Server ── */}
          {activeSection === 'email' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-5 py-4 border-b dark:border-gray-700">
                <h2 className="text-lg font-semibold dark:text-white">Email Server (SMTP)</h2>
                <p className="text-xs text-gray-500 mt-0.5">Configure the mail relay used for alert notifications</p>
              </div>
              {smtp && (
                <div className="p-5 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>SMTP Host *</label>
                      <input className={inputClass} value={smtp.smtp_host}
                        disabled={!isAdmin}
                        onChange={(e) => setSmtpField('smtp_host', e.target.value)}
                        placeholder="smtp.example.com" />
                    </div>
                    <div>
                      <label className={labelClass}>SMTP Port *</label>
                      <input type="number" className={inputClass} value={smtp.smtp_port}
                        disabled={!isAdmin}
                        onChange={(e) => setSmtpField('smtp_port', parseInt(e.target.value) || 587)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Username</label>
                      <input className={inputClass} value={smtp.smtp_username}
                        disabled={!isAdmin}
                        onChange={(e) => setSmtpField('smtp_username', e.target.value)}
                        placeholder="Optional — for authenticated relay" />
                    </div>
                    <div>
                      <label className={labelClass}>Password</label>
                      <input type="password" className={inputClass} value={smtp.smtp_password}
                        disabled={!isAdmin}
                        onChange={(e) => setSmtpField('smtp_password', e.target.value)}
                        placeholder={smtp.smtp_password === '****' ? '(set — leave blank to keep)' : 'Optional'} />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>From Address *</label>
                    <input type="email" className={inputClass} value={smtp.smtp_from}
                      disabled={!isAdmin}
                      onChange={(e) => setSmtpField('smtp_from', e.target.value)}
                      placeholder="monitoring@example.com" />
                  </div>

                  <label className={`flex items-center gap-2 ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                    <input type="checkbox" checked={smtp.smtp_use_tls}
                      disabled={!isAdmin}
                      onChange={(e) => setSmtpField('smtp_use_tls', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm dark:text-gray-300">Use TLS (STARTTLS)</span>
                  </label>

                  {isAdmin && (
                    <>
                      <div className="flex items-center gap-3">
                        <button onClick={saveSmtp} disabled={smtpSaving}
                          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          {smtpSaving ? 'Saving...' : 'Save Settings'}
                        </button>
                        {smtpMsg && (
                          <span className={`text-sm ${smtpMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{smtpMsg}</span>
                        )}
                      </div>

                      <div className="border-t dark:border-gray-700 pt-5">
                        <h3 className="text-sm font-semibold dark:text-white mb-3">Send Test Email</h3>
                        <div className="flex items-center gap-3">
                          <input type="email" className={inputClass + ' max-w-xs'} value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="recipient@example.com" />
                          <button onClick={sendTestEmail} disabled={testSending}
                            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                            {testSending ? 'Sending...' : 'Send Test'}
                          </button>
                        </div>
                        {testMsg && (
                          <p className={`text-sm mt-2 ${testMsg.includes('success') ? 'text-green-600' : 'text-red-600'}`}>{testMsg}</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Users ── */}
          {activeSection === 'users' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-5 py-4 border-b dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold dark:text-white">User Management</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{users.length} user{users.length !== 1 ? 's' : ''} configured</p>
                </div>
                {isAdmin && (
                  <button onClick={openAddUser}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                    + Add User
                  </button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    <tr>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Source</th>
                      <th className="px-4 py-3">Active</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 font-medium dark:text-white">{u.username}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.email}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">{u.role}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.auth_source}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${u.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isAdmin && (
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEditUser(u)}
                                className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 rounded">Edit</button>
                              <button onClick={() => setUserDeleteTarget(u)}
                                className="text-xs px-2 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-gray-700 rounded">Deactivate</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeSection === 'ssl' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
              <div className="px-5 py-4 border-b dark:border-gray-700">
                <h2 className="text-lg font-semibold dark:text-white">SSL / TLS Certificates</h2>
                <p className="text-xs text-gray-500 mt-0.5">Manage SSL certificates for HTTPS</p>
              </div>
              <div className="p-5">
                <SSLSettings />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SNMP Add/Edit Modal */}
      {showSNMPForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {snmpEditId ? 'Edit Credential' : 'Add SNMP Credential'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              {snmpError && (
                <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg">{snmpError}</div>
              )}
              <div>
                <label className={labelClass}>Name *</label>
                <input className={inputClass} value={snmpForm.name} onChange={(e) => setSNMPField('name', e.target.value)} placeholder="e.g. Public Read-Only" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>SNMP Version *</label>
                  <select className={inputClass} value={snmpForm.version} onChange={(e) => setSNMPField('version', e.target.value)}>
                    <option value="v1">SNMPv1</option>
                    <option value="v2c">SNMPv2c</option>
                    <option value="v3">SNMPv3</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Port</label>
                  <input className={inputClass} type="number" value={snmpForm.port} onChange={(e) => setSNMPField('port', parseInt(e.target.value) || 161)} />
                </div>
              </div>
              {snmpForm.version !== 'v3' && (
                <div>
                  <label className={labelClass}>Community String {!snmpEditId && '*'}</label>
                  <input className={inputClass} type="password" value={snmpForm.community} onChange={(e) => setSNMPField('community', e.target.value)}
                    placeholder={snmpEditId ? '(leave blank to keep current)' : 'e.g. public'} />
                </div>
              )}
              {snmpForm.version === 'v3' && (
                <>
                  <div>
                    <label className={labelClass}>Username {!snmpEditId && '*'}</label>
                    <input className={inputClass} value={snmpForm.username} onChange={(e) => setSNMPField('username', e.target.value)} placeholder="SNMPv3 security name" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Auth Protocol</label>
                      <select className={inputClass} value={snmpForm.auth_protocol} onChange={(e) => setSNMPField('auth_protocol', e.target.value)}>
                        <option value="">None (noAuth)</option>
                        <option value="MD5">MD5</option>
                        <option value="SHA">SHA</option>
                        <option value="SHA256">SHA-256</option>
                        <option value="SHA512">SHA-512</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Auth Password</label>
                      <input className={inputClass} type="password" value={snmpForm.auth_password} onChange={(e) => setSNMPField('auth_password', e.target.value)}
                        placeholder={snmpEditId ? '(leave blank to keep)' : 'Auth passphrase'} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Privacy Protocol</label>
                      <select className={inputClass} value={snmpForm.priv_protocol} onChange={(e) => setSNMPField('priv_protocol', e.target.value)}>
                        <option value="">None (noPriv)</option>
                        <option value="DES">DES</option>
                        <option value="AES">AES-128</option>
                        <option value="AES192">AES-192</option>
                        <option value="AES256">AES-256</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Privacy Password</label>
                      <input className={inputClass} type="password" value={snmpForm.priv_password} onChange={(e) => setSNMPField('priv_password', e.target.value)}
                        placeholder={snmpEditId ? '(leave blank to keep)' : 'Priv passphrase'} />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className={labelClass}>Description</label>
                <input className={inputClass} value={snmpForm.description} onChange={(e) => setSNMPField('description', e.target.value)} placeholder="Optional description" />
              </div>
            </div>
            <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowSNMPForm(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleSaveSNMP} disabled={snmpSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {snmpSaving ? 'Saving...' : snmpEditId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Channel Add/Edit Modal */}
      {showChannelForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {channelEditId ? 'Edit Channel' : 'Add Notification Channel'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              {channelError && (
                <div className="p-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg">{channelError}</div>
              )}
              <div>
                <label className={labelClass}>Name *</label>
                <input className={inputClass} value={channelForm.name}
                  onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
                  placeholder="e.g. Ops Team Email" />
              </div>
              <div>
                <label className={labelClass}>Type *</label>
                <select className={inputClass} value={channelForm.channel_type}
                  onChange={(e) => setChannelForm({ ...channelForm, channel_type: e.target.value })}>
                  <option value="email">Email</option>
                  <option value="webhook">Webhook</option>
                  <option value="slack">Slack</option>
                </select>
              </div>
              {channelForm.channel_type === 'email' ? (
                <>
                  <div>
                    <label className={labelClass}>Quick Fill from User</label>
                    <select className={inputClass}
                      value=""
                      onChange={(e) => {
                        const u = users.find(u => u.id === Number(e.target.value));
                        if (u) {
                          setChannelForm({
                            ...channelForm,
                            name: channelForm.name || `${u.full_name || u.username} Alerts`,
                            to: u.email,
                          });
                        }
                      }}>
                      <option value="">Select a user...</option>
                      {users.filter(u => u.is_active && u.email).map(u => (
                        <option key={u.id} value={u.id}>{u.full_name || u.username} ({u.email})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Recipient Email *</label>
                    <input type="email" className={inputClass} value={channelForm.to}
                      onChange={(e) => setChannelForm({ ...channelForm, to: e.target.value })}
                      placeholder="alerts@example.com" />
                  </div>
                </>
              ) : (
                <div>
                  <label className={labelClass}>Webhook URL *</label>
                  <input type="url" className={inputClass} value={channelForm.url}
                    onChange={(e) => setChannelForm({ ...channelForm, url: e.target.value })}
                    placeholder="https://hooks.slack.com/..." />
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={channelForm.enabled}
                  onChange={(e) => setChannelForm({ ...channelForm, enabled: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm dark:text-gray-300">Enabled</span>
              </label>
            </div>
            <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowChannelForm(false)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={handleSaveChannel} disabled={channelSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {channelSaving ? 'Saving...' : channelEditId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SNMP Delete Confirm */}
      <ConfirmDialog
        open={!!snmpDeleteTarget}
        title="Delete Credential"
        message={`Are you sure you want to delete "${snmpDeleteTarget?.name}"? Devices using this credential will lose their SNMP configuration.`}
        onConfirm={handleDeleteSNMP}
        onCancel={() => setSNMPDeleteTarget(null)}
      />

      {/* Channel Delete Confirm */}
      <ConfirmDialog
        open={!!channelDeleteTarget}
        title="Delete Channel"
        message={`Are you sure you want to delete "${channelDeleteTarget?.name}"? Alert notifications will no longer be sent to this channel.`}
        onConfirm={handleDeleteChannel}
        onCancel={() => setChannelDeleteTarget(null)}
      />

      {/* User Add/Edit Modal */}
      {showUserForm && (
        <UserForm
          user={userEditTarget}
          onSuccess={handleUserFormSuccess}
          onCancel={() => { setShowUserForm(false); setUserEditTarget(undefined); }}
        />
      )}

      {/* User Deactivate Confirm */}
      <ConfirmDialog
        open={!!userDeleteTarget}
        title="Deactivate User"
        message={`Are you sure you want to deactivate "${userDeleteTarget?.username}"? They will no longer be able to log in.`}
        onConfirm={handleDeleteUser}
        onCancel={() => setUserDeleteTarget(null)}
      />
    </div>
  );
}
