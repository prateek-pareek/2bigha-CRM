'use client';
import React from 'react';

export interface MemberPerformanceEntry {
  id: string;
  name: string;
  leads: number;
  assigned: number;
  calls: number;
  connectedRate: number;
  properties: number;
  taskStatus: string;
  score: number;
}

interface MemberPerformanceTableProps {
  title: string;
  data: MemberPerformanceEntry[];
  loading?: boolean;
}

export const MemberPerformanceTable: React.FC<MemberPerformanceTableProps> = ({ title, data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-6"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded w-full mb-3"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
          {title}
        </h3>
        <span className="text-xs text-gray-400">Click a row to view member detail ↓</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-700/50 dark:text-gray-400 uppercase">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3 text-right">Total Leads</th>
              <th className="px-4 py-3 text-right">Assigned</th>
              <th className="px-4 py-3 text-right">Calls</th>
              <th className="px-4 py-3 text-right">Connected</th>
              <th className="px-4 py-3 text-right">Properties</th>
              <th className="px-4 py-3 text-right">Task Status</th>
              <th className="px-4 py-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No member performance data for this period
                </td>
              </tr>
            ) : (
              data.map((entry, index) => (
                <tr
                  key={entry.id}
                  className={`border-b last:border-0 border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors cursor-pointer ${
                    index === 0 ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white flex items-center">
                    {entry.name} {index === 0 && <span className="ml-1 text-gray-400">▸</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.leads}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.assigned}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.calls}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.connectedRate > 0 ? `${entry.connectedRate}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.properties}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`${entry.taskStatus.includes('overdue') ? 'text-yellow-600 dark:text-yellow-500' : 'text-gray-600 dark:text-gray-300'}`}>
                      {entry.taskStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">
                    {entry.score}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
