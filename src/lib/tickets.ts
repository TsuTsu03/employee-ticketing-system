// Ticket domain constants shared by employee + admin views.

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

/** Tailwind classes for status pills (work in light + dark). */
export const STATUS_CLASSES: Record<TicketStatus, string> = {
  OPEN: 'bg-blue-500/12 text-blue-600 dark:text-blue-300 border-blue-500/20',
  IN_PROGRESS: 'bg-amber-500/12 text-amber-600 dark:text-amber-300 border-amber-500/20',
  RESOLVED: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border-emerald-500/20',
  CLOSED: 'bg-muted text-muted-foreground border-border',
};

export const PRIORITY_CLASSES: Record<TicketPriority, string> = {
  LOW: 'bg-muted text-muted-foreground border-border',
  MEDIUM: 'bg-sky-500/12 text-sky-600 dark:text-sky-300 border-sky-500/20',
  HIGH: 'bg-orange-500/12 text-orange-600 dark:text-orange-300 border-orange-500/20',
  URGENT: 'bg-red-500/14 text-red-600 dark:text-red-300 border-red-500/25',
};

export const PRIORITY_RANK: Record<TicketPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function isStatus(v: unknown): v is TicketStatus {
  return typeof v === 'string' && (TICKET_STATUSES as readonly string[]).includes(v);
}

export function isPriority(v: unknown): v is TicketPriority {
  return typeof v === 'string' && (TICKET_PRIORITIES as readonly string[]).includes(v);
}

/** Tolerant of legacy/unknown values coming from the DB. */
export function normalizeStatus(v: unknown): TicketStatus {
  const s = String(v ?? '').toUpperCase();
  if (s === 'COMPLETED') return 'RESOLVED'; // legacy value migration
  return isStatus(s) ? s : 'OPEN';
}

export function normalizePriority(v: unknown): TicketPriority {
  const s = String(v ?? '').toUpperCase();
  return isPriority(s) ? s : 'MEDIUM';
}
