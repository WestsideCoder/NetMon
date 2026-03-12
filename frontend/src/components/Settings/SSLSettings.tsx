// SPDX-License-Identifier: GPL-3.0-or-later
import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Plus, Upload, Download, Trash2, CheckCircle, AlertTriangle,
  RefreshCw, Key, Award, Lock, FileText,
} from 'lucide-react';
import api from '../../api/client';
import type { SSLCertificate, SSLStatus } from '../../types';
import { formatDate } from '../../utils/date';
import CertUploadModal from './CertUploadModal';
import ConfirmDialog from '../Common/ConfirmDialog';

export default function SSLSettings() {
  const [certs, setCerts] = useState<SSLCertificate[]>([]);
  const [sslStatus, setSSLStatus] = useState<SSLStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // CA generation form
  const [showCAForm, setShowCAForm] = useState(false);
  const [caForm, setCAForm] = useState({ name: '', common_name: '', organization: 'NetMon', validity_days: 3650, key_size: 4096 });
  const [caGenerating, setCAGenerating] = useState(false);

  // Server cert form
  const [showServerForm, setShowServerForm] = useState(false);
  const [serverForm, setServerForm] = useState({ name: '', common_name: '', san_dns: '', san_ips: '', validity_days: 365, key_size: 2048 });
  const [serverGenerating, setServerGenerating] = useState(false);

  // CSR form
  const [showCSRForm, setShowCSRForm] = useState(false);
  const [csrForm, setCSRForm] = useState({ name: '', common_name: '', organization: 'NetMon', san_dns: '', san_ips: '', key_size: 2048 });
  const [csrGenerating, setCSRGenerating] = useState(false);
  const [completingCSR, setCompletingCSR] = useState<number | null>(null);

  // Upload modal
  const [showUpload, setShowUpload] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<SSLCertificate | null>(null);

  // Messages
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [reloading, setReloading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [certsRes, statusRes] = await Promise.all([
        api.get('/api/ssl/'),
        api.get('/api/ssl/status'),
      ]);
      setCerts(certsRes.data.items);
      setSSLStatus(statusRes.data);
    } catch {
      setError('Failed to load SSL data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showMsg = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 4000);
  };

  // -- CA Generation --
  const handleGenerateCA = async (e: React.FormEvent) => {
    e.preventDefault();
    setCAGenerating(true);
    setError('');
    try {
      await api.post('/api/ssl/generate-ca', {
        name: caForm.name,
        common_name: caForm.common_name,
        organization: caForm.organization,
        validity_days: caForm.validity_days,
        key_size: caForm.key_size,
      });
      setShowCAForm(false);
      setCAForm({ name: '', common_name: '', organization: 'NetMon', validity_days: 3650, key_size: 4096 });
      showMsg('CA certificate generated successfully');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'CA generation failed');
    } finally {
      setCAGenerating(false);
    }
  };

  // -- Server Cert Generation --
  const handleGenerateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerGenerating(true);
    setError('');
    try {
      const san_dns_names = serverForm.san_dns.split('\n').map(s => s.trim()).filter(Boolean);
      const san_ip_addresses = serverForm.san_ips.split('\n').map(s => s.trim()).filter(Boolean);
      await api.post('/api/ssl/generate-server', {
        name: serverForm.name,
        common_name: serverForm.common_name,
        san_dns_names,
        san_ip_addresses,
        validity_days: serverForm.validity_days,
        key_size: serverForm.key_size,
      });
      setShowServerForm(false);
      setServerForm({ name: '', common_name: '', san_dns: '', san_ips: '', validity_days: 365, key_size: 2048 });
      showMsg('Server certificate generated successfully');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Server cert generation failed');
    } finally {
      setServerGenerating(false);
    }
  };

  // -- Activate --
  const handleActivate = async (cert: SSLCertificate) => {
    setError('');
    try {
      const res = await api.post(`/api/ssl/${cert.id}/activate`);
      showMsg(`Certificate "${cert.name}" activated`);
      if (res.data.nginx_reload_needed && sslStatus?.nginx_reload_available) {
        showMsg(`Certificate activated. Click "Reload Nginx" to apply.`);
      }
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Activation failed');
    }
  };

  // -- Delete --
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/api/ssl/${deleteTarget.id}`);
      setDeleteTarget(null);
      showMsg('Certificate deleted');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Delete failed');
      setDeleteTarget(null);
    }
  };

  // -- Generate CSR --
  const handleGenerateCSR = async (e: React.FormEvent) => {
    e.preventDefault();
    setCSRGenerating(true);
    setError('');
    try {
      const san_dns_names = csrForm.san_dns.split('\n').map(s => s.trim()).filter(Boolean);
      const san_ip_addresses = csrForm.san_ips.split('\n').map(s => s.trim()).filter(Boolean);
      await api.post('/api/ssl/generate-csr', {
        name: csrForm.name,
        common_name: csrForm.common_name,
        organization: csrForm.organization,
        san_dns_names,
        san_ip_addresses,
        key_size: csrForm.key_size,
      });
      setShowCSRForm(false);
      setCSRForm({ name: '', common_name: '', organization: 'NetMon', san_dns: '', san_ips: '', key_size: 2048 });
      showMsg('CSR generated. Download it and submit to your CA.');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'CSR generation failed');
    } finally {
      setCSRGenerating(false);
    }
  };

  // -- Download CSR --
  const handleDownloadCSR = async (cert: SSLCertificate) => {
    try {
      const res = await api.get(`/api/ssl/${cert.id}/download-csr`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cert.name.replace(/\s+/g, '_')}.csr.pem`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('CSR download failed');
    }
  };

  // -- Complete CSR (upload signed cert) --
  const handleCompleteCSR = async (certId: number, file: File) => {
    setCompletingCSR(certId);
    setError('');
    try {
      const formData = new FormData();
      formData.append('cert_file', file);
      await api.post(`/api/ssl/${certId}/complete-csr`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showMsg('Signed certificate uploaded. You can now activate it.');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload signed certificate');
    } finally {
      setCompletingCSR(null);
    }
  };

  // -- Download --
  const handleDownload = async (cert: SSLCertificate) => {
    try {
      const res = await api.get(`/api/ssl/${cert.id}/download-cert`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cert.name.replace(/\s+/g, '_')}.pem`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Download failed');
    }
  };

  const handleDownloadCA = async () => {
    try {
      const res = await api.get('/api/ssl/ca/download', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'netmon_ca.pem';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('CA download failed');
    }
  };

  // -- Nginx Reload --
  const handleReloadNginx = async () => {
    setReloading(true);
    setError('');
    try {
      await api.post('/api/ssl/reload-nginx');
      showMsg('Nginx reloaded successfully');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Nginx reload failed');
    } finally {
      setReloading(false);
    }
  };

  // -- Helpers --
  const typeBadge = (cert: SSLCertificate) => {
    const colors: Record<string, string> = {
      ca: 'bg-purple-100 text-purple-800',
      server: 'bg-blue-100 text-blue-800',
      uploaded: 'bg-gray-100 text-gray-800',
      csr: 'bg-yellow-100 text-yellow-800',
    };
    const labels: Record<string, string> = { ca: 'CA', server: 'Server', uploaded: 'Uploaded', csr: 'Pending CSR' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[cert.cert_type] || colors.uploaded}`}>
        {labels[cert.cert_type] || cert.cert_type}
      </span>
    );
  };

  const isExpiringSoon = (cert: SSLCertificate) => {
    if (!cert.not_after) return false;
    const expiry = new Date(cert.not_after);
    const daysLeft = (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysLeft < 30;
  };

  const isExpired = (cert: SSLCertificate) => {
    if (!cert.not_after) return false;
    return new Date(cert.not_after) < new Date();
  };

  if (loading) return <div className="text-gray-500">Loading SSL settings...</div>;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {sslStatus && (
        <div className={`p-4 rounded-lg border ${
          sslStatus.active_cert
            ? isExpired(sslStatus.active_cert) ? 'bg-red-50 border-red-200' :
              isExpiringSoon(sslStatus.active_cert) ? 'bg-yellow-50 border-yellow-200' :
              'bg-green-50 border-green-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-start gap-3">
            <Shield className={`w-5 h-5 mt-0.5 ${
              sslStatus.active_cert
                ? isExpired(sslStatus.active_cert) ? 'text-red-600' :
                  isExpiringSoon(sslStatus.active_cert) ? 'text-yellow-600' :
                  'text-green-600'
                : 'text-gray-400'
            }`} />
            <div className="text-sm">
              {sslStatus.active_cert ? (
                <>
                  <p className="font-medium">
                    Active: {sslStatus.active_cert.name} ({sslStatus.active_cert.common_name})
                  </p>
                  <p className="text-gray-600">
                    Expires: {sslStatus.active_cert.not_after ? formatDate(sslStatus.active_cert.not_after) : 'Unknown'}
                    {isExpired(sslStatus.active_cert) && <span className="ml-2 text-red-600 font-medium">EXPIRED</span>}
                    {!isExpired(sslStatus.active_cert) && isExpiringSoon(sslStatus.active_cert) && (
                      <span className="ml-2 text-yellow-600 font-medium">Expiring soon</span>
                    )}
                  </p>
                  {sslStatus.active_cert.issuer && (
                    <p className="text-gray-500">Issuer: {sslStatus.active_cert.issuer}</p>
                  )}
                </>
              ) : (
                <p className="text-gray-600">No active server certificate. Using default self-signed cert.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> {success}
        </div>
      )}

      {/* CA Section */}
      <div className="border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium flex items-center gap-2">
            <Key className="w-4 h-4 text-purple-600" />
            Certificate Authority (CA)
          </h3>
          <div className="flex gap-2">
            {sslStatus?.has_ca && (
              <button
                onClick={handleDownloadCA}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100"
              >
                <Download className="w-3.5 h-3.5" /> Download CA
              </button>
            )}
            <button
              onClick={() => setShowCAForm(!showCAForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700"
            >
              <Plus className="w-3.5 h-3.5" /> Generate CA
            </button>
          </div>
        </div>

        {sslStatus?.active_ca && (
          <p className="text-sm text-gray-600 mb-3">
            Active CA: <span className="font-medium">{sslStatus.active_ca.name}</span> ({sslStatus.active_ca.common_name})
            {' '}&mdash; expires {sslStatus.active_ca.not_after ? formatDate(sslStatus.active_ca.not_after) : 'unknown'}
          </p>
        )}

        {!sslStatus?.has_ca && (
          <p className="text-sm text-gray-500">
            No CA generated yet. Generate one to sign server certificates, or upload an existing cert below.
          </p>
        )}

        {/* CA Generation Form */}
        {showCAForm && (
          <form onSubmit={handleGenerateCA} className="mt-3 border-t pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={caForm.name}
                  onChange={e => setCAForm({ ...caForm, name: e.target.value })}
                  placeholder="e.g. NetMon Root CA"
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Common Name (CN)</label>
                <input
                  type="text"
                  required
                  value={caForm.common_name}
                  onChange={e => setCAForm({ ...caForm, common_name: e.target.value })}
                  placeholder="e.g. NetMon Internal CA"
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Organization</label>
                <input
                  type="text"
                  value={caForm.organization}
                  onChange={e => setCAForm({ ...caForm, organization: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Validity (days)</label>
                <input
                  type="number"
                  min={1}
                  max={36500}
                  value={caForm.validity_days}
                  onChange={e => setCAForm({ ...caForm, validity_days: parseInt(e.target.value) || 3650 })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCAForm(false)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200">
                Cancel
              </button>
              <button type="submit" disabled={caGenerating} className="px-3 py-1.5 text-sm text-white bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50">
                {caGenerating ? 'Generating...' : 'Generate CA'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Actions Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowServerForm(!showServerForm)}
          disabled={!sslStatus?.has_ca}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title={!sslStatus?.has_ca ? 'Generate a CA first' : ''}
        >
          <Award className="w-4 h-4" /> Generate Server Cert
        </button>
        <button
          onClick={() => setShowCSRForm(!showCSRForm)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
        >
          <FileText className="w-4 h-4" /> Generate CSR
        </button>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
        >
          <Upload className="w-4 h-4" /> Upload Certificate
        </button>
        <div className="flex-1" />
        <button
          onClick={handleReloadNginx}
          disabled={reloading || !sslStatus?.nginx_reload_available}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-orange-50 text-orange-700 border border-orange-200 rounded-md hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title={!sslStatus?.nginx_reload_available ? 'Docker socket not available' : ''}
        >
          <RefreshCw className={`w-4 h-4 ${reloading ? 'animate-spin' : ''}`} />
          {reloading ? 'Reloading...' : 'Reload Nginx'}
        </button>
      </div>

      {/* Server Cert Generation Form */}
      {showServerForm && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-blue-600" />
            Generate Server Certificate
          </h3>
          <form onSubmit={handleGenerateServer} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={serverForm.name}
                  onChange={e => setServerForm({ ...serverForm, name: e.target.value })}
                  placeholder="e.g. NetMon Server 2026"
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Common Name (CN)</label>
                <input
                  type="text"
                  required
                  value={serverForm.common_name}
                  onChange={e => setServerForm({ ...serverForm, common_name: e.target.value })}
                  placeholder="e.g. netmon.example.com or *.example.com"
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">SAN DNS Names (one per line)</label>
                <textarea
                  rows={3}
                  value={serverForm.san_dns}
                  onChange={e => setServerForm({ ...serverForm, san_dns: e.target.value })}
                  placeholder={"netmon.example.com\n*.example.com"}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">SAN IP Addresses (one per line)</label>
                <textarea
                  rows={3}
                  value={serverForm.san_ips}
                  onChange={e => setServerForm({ ...serverForm, san_ips: e.target.value })}
                  placeholder={"10.0.0.1\n192.168.1.100"}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Validity (days)</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={serverForm.validity_days}
                  onChange={e => setServerForm({ ...serverForm, validity_days: parseInt(e.target.value) || 365 })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Key Size</label>
                <select
                  value={serverForm.key_size}
                  onChange={e => setServerForm({ ...serverForm, key_size: parseInt(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={2048}>2048-bit</option>
                  <option value={4096}>4096-bit</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowServerForm(false)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200">
                Cancel
              </button>
              <button type="submit" disabled={serverGenerating} className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                {serverGenerating ? 'Generating...' : 'Generate Certificate'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSR Generation Form */}
      {showCSRForm && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-yellow-600" />
            Generate Certificate Signing Request (CSR)
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Generate a CSR and private key. Download the CSR, submit it to your Certificate Authority, then upload the signed certificate back here.
          </p>
          <form onSubmit={handleGenerateCSR} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                <input type="text" required value={csrForm.name}
                  onChange={e => setCSRForm({ ...csrForm, name: e.target.value })}
                  placeholder="e.g. Production Cert 2026"
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-yellow-500 focus:border-yellow-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Common Name (CN)</label>
                <input type="text" required value={csrForm.common_name}
                  onChange={e => setCSRForm({ ...csrForm, common_name: e.target.value })}
                  placeholder="e.g. netmon.example.com"
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-yellow-500 focus:border-yellow-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Organization</label>
                <input type="text" value={csrForm.organization}
                  onChange={e => setCSRForm({ ...csrForm, organization: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-yellow-500 focus:border-yellow-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Key Size</label>
                <select value={csrForm.key_size}
                  onChange={e => setCSRForm({ ...csrForm, key_size: parseInt(e.target.value) })}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-yellow-500 focus:border-yellow-500">
                  <option value={2048}>2048-bit</option>
                  <option value={4096}>4096-bit</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">SAN DNS Names (one per line)</label>
                <textarea rows={3} value={csrForm.san_dns}
                  onChange={e => setCSRForm({ ...csrForm, san_dns: e.target.value })}
                  placeholder={"netmon.example.com\n*.example.com"}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-yellow-500 focus:border-yellow-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">SAN IP Addresses (one per line)</label>
                <textarea rows={3} value={csrForm.san_ips}
                  onChange={e => setCSRForm({ ...csrForm, san_ips: e.target.value })}
                  placeholder={"10.0.0.1\n192.168.1.100"}
                  className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:ring-yellow-500 focus:border-yellow-500" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCSRForm(false)} className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200">
                Cancel
              </button>
              <button type="submit" disabled={csrGenerating} className="px-3 py-1.5 text-sm text-white bg-yellow-600 rounded hover:bg-yellow-700 disabled:opacity-50">
                {csrGenerating ? 'Generating...' : 'Generate CSR'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Certificate Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">CN / SANs</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Expires</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {certs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  No certificates yet. Generate a CA to get started, or upload an existing certificate.
                </td>
              </tr>
            ) : (
              certs.map(cert => (
                <tr key={cert.id} className={cert.is_active ? 'bg-green-50/50' : ''}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-gray-400" />
                      {cert.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{typeBadge(cert)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div>{cert.common_name}</div>
                    {cert.subject_alt_names && cert.subject_alt_names.length > 0 && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        SANs: {cert.subject_alt_names.slice(0, 3).join(', ')}
                        {cert.subject_alt_names.length > 3 && ` +${cert.subject_alt_names.length - 3} more`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={
                      isExpired(cert) ? 'text-red-600 font-medium' :
                      isExpiringSoon(cert) ? 'text-yellow-600' :
                      'text-gray-700'
                    }>
                      {cert.not_after ? formatDate(cert.not_after) : 'N/A'}
                    </span>
                    {isExpired(cert) && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700">Expired</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {cert.cert_type === 'csr' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                        <FileText className="w-3 h-3" /> Awaiting Cert
                      </span>
                    ) : cert.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="text-gray-400 text-xs">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <div className="flex items-center justify-end gap-1">
                      {cert.cert_type === 'csr' ? (
                        <>
                          <button
                            onClick={() => handleDownloadCSR(cert)}
                            className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded"
                            title="Download CSR"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <label
                            className={`p-1.5 text-green-600 hover:bg-green-50 rounded cursor-pointer ${completingCSR === cert.id ? 'opacity-50' : ''}`}
                            title="Upload signed certificate"
                          >
                            <Upload className="w-4 h-4" />
                            <input type="file" accept=".pem,.crt" className="hidden"
                              disabled={completingCSR === cert.id}
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) handleCompleteCSR(cert.id, f);
                                e.target.value = '';
                              }} />
                          </label>
                        </>
                      ) : (
                        <>
                          {!cert.is_active && (
                            <button
                              onClick={() => handleActivate(cert)}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                              title="Activate"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDownload(cert)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title="Download certificate"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setDeleteTarget(cert)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <CertUploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => {
            setShowUpload(false);
            showMsg('Certificate uploaded successfully');
            fetchData();
          }}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Certificate"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"?${deleteTarget.is_active ? ' This certificate is currently ACTIVE — nginx will fall back to the default self-signed cert.' : ''} The certificate files will be permanently removed.` : ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
