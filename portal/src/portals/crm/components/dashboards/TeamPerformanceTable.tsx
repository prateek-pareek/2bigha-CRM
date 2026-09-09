'use client';
import React from 'react';

export interface TeamPerformanceEntry {
  teamId: string;
  teamName: string;
  teamLead: string;
  teamSize: number;
  totalLeads: number;
  totalCalls: number;
  connectedRate: number;
  totalProperties: number;
  taskCompletionRate: number;
  score: number;
}

interface TeamPerformanceTableProps {
  title: string;
  data: TeamPerformanceEntry[];
  loading?: boolean;
}

export const TeamPerformanceTable: React.FC<TeamPerformanceTableProps> = ({ title, data, loading }) => {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-6"></div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded w-full mb-3"></div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-700/50 dark:text-gray-400 uppercase">
            <tr>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Team Lead</th>
              <th className="px-4 py-3 text-right">Members</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">Calls</th>
              <th className="px-4 py-3 text-right">Connected</th>
              <th className="px-4 py-3 text-right">Properties</th>
              <th className="px-4 py-3 text-right">Task Compl.</th>
              <th className="px-4 py-3 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                  No team performance data for this period
                </td>
              </tr>
            ) : (
              data.map((entry) => (
                <tr
                  key={entry.teamId}
                  className="border-b last:border-0 border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">
                    {entry.teamName}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {entry.teamLead}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.teamSize}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.totalLeads}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.totalCalls}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${entry.connectedRate >= 60 ? 'text-green-600 dark:text-green-400' :
                        entry.connectedRate >= 40 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                      }`}>
                      {entry.connectedRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.totalProperties}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.taskCompletionRate}%
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
