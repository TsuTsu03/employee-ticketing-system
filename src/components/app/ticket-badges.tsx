import { cn } from '@/lib/utils';
import {
  PRIORITY_CLASSES,
  PRIORITY_LABEL,
  STATUS_CLASSES,
  STATUS_LABEL,
  type TicketPriority,
  type TicketStatus,
} from '@/lib/tickets';

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        STATUS_CLASSES[status],
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({
  priority,
  className,
}: {
  priority: TicketPriority;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        PRIORITY_CLASSES[priority],
        className
      )}
    >
      {PRIORITY_LABEL[priority]}
    </span>
  );
}
