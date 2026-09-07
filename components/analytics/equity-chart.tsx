'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';

export interface EquityPoint {
  date: string;
  equity: number;
  balance: number;
}

export function EquityChart({ data }: { data: EquityPoint[] }) {
  if (data.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No closed trades yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(199 89% 55%)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(199 89% 55%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 18%)" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(215 14% 60%)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(215 14% 60%)' }} axisLine={false} tickLine={false} width={70} />
        <Tooltip
          contentStyle={{ background: 'hsl(222 40% 9%)', border: '1px solid hsl(222 20% 18%)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'hsl(210 20% 92%)' }}
        />
        <Area type="monotone" dataKey="equity" stroke="hsl(199 89% 55%)" fill="url(#equityGradient)" strokeWidth={2} name="Cumulative P/L" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
