'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LineChart } from 'lucide-react';
import { PRIMARY_NAV, SECONDARY_NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <LineChart className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold leading-tight text-foreground">
          MT5 Scalp
          <br />
          Command Center
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}
        <div className="my-3 h-px bg-border" />
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}
      </nav>
    </aside>
  );
}

function NavLink({ item, active }: { item: (typeof PRIMARY_NAV)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-accent/10 text-accent'
          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
