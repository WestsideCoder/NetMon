// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useRef, useCallback } from 'react';

function getWsUrl(): string {
  const env = import.meta.env.VITE_WS_URL;
  if (env) return env;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
}

export function useWebSocket(onMessage: (data: unknown) => void) {
  const ws = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setTimeout(connect, 5000);
        return;
      }
      const socket = new WebSocket(`${getWsUrl()}/ws?token=${encodeURIComponent(token)}`);
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch {
          // ignore non-JSON messages
        }
      };
      socket.onclose = () => {
        setTimeout(connect, 5000); // auto-reconnect
      };
      socket.onerror = () => {
        // error is followed by onclose which triggers reconnect
      };
      ws.current = socket;
    } catch {
      setTimeout(connect, 5000);
    }
  }, [onMessage]);

  useEffect(() => {
    connect();
    return () => { ws.current?.close(); };
  }, [connect]);
}
