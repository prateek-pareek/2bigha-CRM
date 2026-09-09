'use client';
import React from 'react';

export interface LeaderboardEntry {
  id: string;
  name: string;
  avatar?: string;
  leads: number;
  calls: number;
  connected: number;
  properties: number;
  taskCompletion: number;
  score: number;
}

interface LeaderboardTableProps {
  title: string;
  data: LeaderboardEntry[];
  loading?: boolean;
}

export const LeaderboardTable: React.FC<LeaderboardTableProps> = ({ title, data, loading }) => {
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
      <div className="p-5 border-b border-gray-100 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
          <span className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-transparent bg-clip-text mr-2">
          </span>
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-700/50 dark:text-gray-400 uppercase">
            <tr>
              <th className="px-4 py-3 text-center w-12">Rank</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">Calls (Conn)</th>
              <th className="px-4 py-3 text-right">Properties</th>
              <th className="px-4 py-3 text-right">Tasks %</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No leaderboard data for this period
                </td>
              </tr>
            ) : (
              data.map((entry, index) => (
                <tr
                  key={entry.id}
                  className="border-b last:border-0 border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                >
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-bold text-xs ${index === 0 ? 'bg-yellow-100 text-yellow-700' :
                        index === 1 ? 'bg-gray-200 text-gray-700' :
                          index === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white flex items-center">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs mr-2 uppercase">
                      {entry.name.substring(0, 2)}
                    </div>
                    {entry.name}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400">
                    {entry.score}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.leads}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.calls} <span className="text-gray-400">({entry.connected})</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                    {entry.properties}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${entry.taskCompletion >= 80 ? 'bg-green-100 text-green-700' :
                        entry.taskCompletion >= 50 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                      }`}>
                      {entry.taskCompletion}%
                    </span>
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
