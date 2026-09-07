"use client";

import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { ReportChartSkeleton } from "@/components/crm/ui/ReportChartSkeleton";

interface TeamActivityHeatmapProps {
  trendData: {
    teams: string[];
    data: any[];
  } | null;
  loading: boolean;
}

export default function TeamActivityHeatmap({
  trendData,
  loading,
}: TeamActivityHeatmapProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Group data by day of week
  const heatmapData = useMemo(() => {
    if (loading || !trendData || !trendData.data || trendData.data.length === 0) return null;

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const activeTeams = trendData.teams.filter(t => trendData.data.some(d => d[t] > 0));
    
    // Matrix [team][dayOfWeek]
    const matrix: Record<string, number[]> = {};
    activeTeams.forEach(team => {
      matrix[team] = [0, 0, 0, 0, 0, 0, 0];
    });

    let maxIntensity = 1;

    trendData.data.forEach(d => {
      const date = new Date(d.date);
      const dayIndex = date.getDay();
      
      activeTeams.forEach(team => {
        matrix[team][dayIndex] += (d[team] || 0);
        if (matrix[team][dayIndex] > maxIntensity) {
          maxIntensity = matrix[team][dayIndex];
        }
      });
    });

    return { days, activeTeams, matrix, maxIntensity };
  }, [trendData, loading]);

  if (loading) {
    return <ReportChartSkeleton type="heatmap" height="350px" />;
  }

  if (!heatmapData) {
    return (
      <div className="rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 h-[350px] flex flex-col justify-center items-center text-[var(--text-muted)] relative">
        <h3 className="text-sm font-bold text-[var(--text-main)] mb-2 self-start absolute top-6 left-6">
          Weekly Activity Heatmap
        </h3>
        <p className="text-xs">No activity data available.</p>
      </div>
    );
  }

  const { days, activeTeams, matrix, maxIntensity } = heatmapData;

  function getIntensityColor(val: number) {
    if (val === 0) return "bg-[var(--surface-dim)]";
    const intensity = val / maxIntensity;
    if (intensity > 0.8) return "bg-blue-600 text-white";
    if (intensity > 0.5) return "bg-blue-500 text-white";
    if (intensity > 0.2) return "bg-blue-400 text-white";
    return "bg-blue-200 text-blue-900";
  }

  return (
    <div className={`rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 transition-all flex flex-col ${isFullScreen ? 'fixed inset-0 z-[100] m-4 overflow-auto shadow-2xl' : 'h-full'}`}>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-main)]">Weekly Activity Heatmap</h3>
          <p className="text-xs text-[var(--text-muted)]">
            Distribution of team activity by day of the week
          </p>
        </div>
        <button 
          type="button" 
          onClick={() => setIsFullScreen(!isFullScreen)}
          className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-dim)] hover:text-[var(--text-main)] transition-colors"
          title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="flex-1 w-full overflow-x-auto pb-4 flex flex-col justify-center min-h-[300px]">
        <div className="min-w-fit flex flex-col items-start pt-2">
          {/* Header row */}
          <div className="flex items-center mb-2">
            <div className="w-28 md:w-36 flex-shrink-0" />
            <div className="flex gap-1.5 md:gap-2">
              {days.map(day => (
                <div key={day} className="w-8 md:w-10 text-center text-[10px] md:text-xs font-semibold text-[var(--text-muted)]">
                  {day}
                </div>
              ))}
            </div>
          </div>

          {/* Grid rows */}
          <div className="space-y-1.5 md:space-y-2">
            {activeTeams.map(team => (
              <div key={team} className="flex items-center group">
                <div className="w-28 md:w-36 flex-shrink-0 pr-3 md:pr-4">
                  <p className="text-[10px] md:text-xs font-semibold text-[var(--text-main)] truncate text-right" title={team}>
                    {team}
                  </p>
                </div>
                <div className="flex gap-1.5 md:gap-2">
                  {days.map((day, i) => {
                    const val = matrix[team][i];
                    return (
                      <div 
                        key={i} 
                        className={`w-8 h-8 md:w-10 md:h-10 rounded-md transition-all duration-300 flex items-center justify-center relative cursor-pointer hover:scale-110 hover:z-10 hover:shadow-[var(--crm-shadow-floating)] ${getIntensityColor(val)}`}
                      >
                        <span className="text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          {val > 0 ? val : ''}
                        </span>
                        
                        {/* Custom Tooltip */}
                        <div className="absolute bottom-full mb-2 opacity-0 hover:opacity-100 group-hover:hover:opacity-100 peer-hover:opacity-100 transition-opacity pointer-events-none z-20 whitespace-nowrap bg-[var(--card-bg)] border border-[var(--border-color)] text-[var(--text-main)] text-xs rounded-md py-1.5 px-3 shadow-lg">
                          <span className="font-bold">{team}</span> on <span className="font-semibold">{day}</span>
                          <br />
                          {val} activities
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Legend */}
      <div className="mt-8 flex items-center justify-end gap-2 text-xs text-[var(--text-muted)]">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="w-4 h-4 rounded-sm bg-[var(--surface-dim)]" />
          <div className="w-4 h-4 rounded-sm bg-blue-200" />
          <div className="w-4 h-4 rounded-sm bg-blue-400" />
          <div className="w-4 h-4 rounded-sm bg-blue-500" />
          <div className="w-4 h-4 rounded-sm bg-blue-600" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
