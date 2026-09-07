'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Cell } from 'recharts';

export function BreakdownChart({ data }: { data: { name: string; netProfit: number }[] }) {
  if (data.length === 0) {
    return <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">No data yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 20% 18%)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(215 14% 60%)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(215 14% 60%)' }} axisLine={false} tickLine={false} width={60} />
        <Tooltip
          contentStyle={{ background: 'hsl(222 40% 9%)', border: '1px solid hsl(222 20% 18%)', borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: 'hsl(210 20% 92%)' }}
        />
        <Bar dataKey="netProfit" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.netProfit >= 0 ? 'hsl(152 69% 45%)' : 'hsl(0 72% 58%)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
