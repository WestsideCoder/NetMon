// SPDX-License-Identifier: GPL-3.0-or-later
import { formatDistanceToNow } from 'date-fns';

/** Parse a UTC ISO string (may lack Z suffix) into a proper Date */
export function parseUTC(iso: string): Date {
  const s = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  return new Date(s);
}

/** Format a UTC ISO string as a localized date/time string */
export function formatDate(iso: string): string {
  return parseUTC(iso).toLocaleString();
}

/** Format a UTC ISO string as a relative time string (e.g. "5 minutes ago") */
export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseUTC(iso), { addSuffix: true });
}
