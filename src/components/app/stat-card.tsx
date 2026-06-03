import type { LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = 'primary',
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  accent?: 'primary' | 'emerald' | 'amber' | 'red' | 'sky';
}) {
  const accentClasses: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
    amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-300',
    red: 'bg-red-500/12 text-red-600 dark:text-red-300',
    sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-300',
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn('grid size-11 place-items-center rounded-xl', accentClasses[accent])}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-muted-foreground truncate text-sm font-medium">{label}</div>
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
          {hint && <div className="text-muted-foreground mt-0.5 truncate text-xs">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
