// Shared formatting helpers used across dashboards.

export function initials(nameOrEmail?: string | null): string {
  const v = (nameOrEmail ?? '').trim();
  if (!v) return 'U';
  if (v.includes('@')) return v.slice(0, 2).toUpperCase();
  return v
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Relative "time ago" for recent activity. */
export function fmtRelative(iso?: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDateTime(iso);
}

/** Duration between two timestamps (end defaults to now) as "Xh Ym". */
export function fmtDuration(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return '—';
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const ms = end - new Date(startIso).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export const fmtNumber = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);
