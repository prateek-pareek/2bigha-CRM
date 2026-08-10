"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export default function SalesTrendChart({ data = [] }: { data?: any[] }) {
  const chartData = data?.length ? data : [
    { name: 'Mon', leads: 0, deals: 0 },
    { name: 'Tue', leads: 0, deals: 0 },
    { name: 'Wed', leads: 0, deals: 0 },
    { name: 'Thu', leads: 0, deals: 0 },
    { name: 'Fri', leads: 0, deals: 0 },
    { name: 'Sat', leads: 0, deals: 0 },
    { name: 'Sun', leads: 0, deals: 0 },
  ];

  return (
    <div className="w-full h-[300px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ee5f3a" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#ee5f3a" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorDeals" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e4de" />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--text-muted)', fontWeight: 600 }}
            dy={10}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--text-muted)', fontWeight: 600 }}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '16px',
              border: '1px solid #ddd8d0',
              boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
              fontSize: '12px',
              fontWeight: 'bold',
              padding: '12px'
            }}
          />
          <Area
            type="monotone"
            dataKey="leads"
            stroke="#ee5f3a"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorLeads)"
            name="Leads"
          />
          <Area
            type="monotone"
            dataKey="deals"
            stroke="#f59e0b"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorDeals)"
            name="Deals"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
