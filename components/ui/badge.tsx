import * as React from 'react';
import { cn } from '@/lib/utils';

type Tone = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'muted';

const toneClasses: Record<Tone, string> = {
  default: 'bg-surface-2 text-foreground border-border',
  success: 'bg-profit/10 text-profit border-profit/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  info: 'bg-info/10 text-info border-info/30',
  muted: 'bg-muted text-muted-foreground border-border',
};

export function Badge({
  tone = 'default',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

export function StatusDot({ tone = 'default', pulse = false }: { tone?: Tone; pulse?: boolean }) {
  const dotColor: Record<Tone, string> = {
    default: 'bg-muted-foreground',
    success: 'bg-profit',
    danger: 'bg-danger',
    warning: 'bg-warning',
    info: 'bg-info',
    muted: 'bg-muted-foreground',
  };
  return <span className={cn('h-2 w-2 rounded-full', dotColor[tone], pulse && 'animate-pulse-dot')} />;
}
