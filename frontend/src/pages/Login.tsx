// SPDX-License-Identifier: GPL-3.0-or-later
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import netmonLogo from '../assets/netmon-logo.jpg';
import westsidecoderLogo from '../assets/westsidecoder-logo.jpg';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="w-full max-w-md p-8 bg-gray-800 rounded-xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <img src={netmonLogo} alt="NetMon" className="h-20 w-20 rounded-xl mb-3" />
          <h1 className="text-2xl font-bold text-white">NetMon <span className="text-yellow-400">(Beta)</span> <span className="text-lg">v0.9</span></h1>
          <p className="text-gray-400 text-sm">Network Monitoring System</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 text-sm text-red-400 bg-red-900/30 rounded-lg">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Username</label>
            <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500" />
          </div>
          <button type="submit" disabled={isLoading}
            className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-gray-500">Default: admin / admin</p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <img src={westsidecoderLogo} alt="WestsideCoder" className="h-6 w-6 rounded" />
          <span className="text-xs text-gray-500">WestsideCoder</span>
        </div>
      </div>
    </div>
  );
}
