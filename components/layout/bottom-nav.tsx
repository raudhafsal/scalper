'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, X } from 'lucide-react';
import { PRIMARY_NAV, SECONDARY_NAV } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = SECONDARY_NAV.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-16 rounded-t-xl border-t border-border bg-surface p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-sm font-medium text-foreground">More</span>
              <button onClick={() => setMoreOpen(false)} className="p-1 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {SECONDARY_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium',
                    pathname.startsWith(item.href)
                      ? 'bg-accent/10 text-accent'
                      : 'text-foreground hover:bg-surface-2',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-surface md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium',
                active ? 'text-accent' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium',
            moreActive ? 'text-accent' : 'text-muted-foreground',
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  );
}
