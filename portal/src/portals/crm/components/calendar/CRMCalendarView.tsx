"use client";

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { cn } from "@/lib/utils";
import { CrmButton } from "@/components/crm/ui";

interface CRMCalendarViewProps {
  items: any[];
  onItemClick?: (item: any) => void;
  dateField?: string;
  titleField?: string;
}

export default function CRMCalendarView({ items, onItemClick, dateField = 'createdAt', titleField }: CRMCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const getItemsForDay = (day: number) => {
    return items.filter(item => {
      const d = new Date(item[dateField]);
      return d.getDate() === day && d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
    });
  };

  return (
    <div className="crm-view-panel h-full animate-in fade-in duration-500">
      <div className="p-6 border-b border-border bg-surface-dim/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--primary-light)] flex items-center justify-center text-primary">
            <CalendarIcon size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-main tracking-tight">{monthName} {year}</h3>
            <p className="text-xs font-medium text-text-muted">Calendar</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CrmButton variant="ghost" onClick={prevMonth} aria-label="Previous month" className="h-9 w-9 px-0">
            <ChevronLeft size={20} />
          </CrmButton>
          <CrmButton variant="secondary" onClick={() => setCurrentDate(new Date())}>
            Today
          </CrmButton>
          <CrmButton variant="ghost" onClick={nextMonth} aria-label="Next month" className="h-9 w-9 px-0">
            <ChevronRight size={20} />
          </CrmButton>
        </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <div className="grid grid-cols-7 border-b border-border bg-surface-dim/10 shrink-0">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-4 text-center text-xs font-semibold text-text-muted border-r border-border last:border-0">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[160px]">
          {days.map((day, idx) => {
            const dayItems = day ? getItemsForDay(day) : [];
            const isToday = day === new Date().getDate() && currentDate.getMonth() === new Date().getMonth() && currentDate.getFullYear() === new Date().getFullYear();
            
            return (
              <div key={idx} className={cn(
                "border-r border-b border-border p-3 flex flex-col gap-2 transition-colors",
                !day && "bg-surface-dim/20",
                day && "hover:bg-primary/[0.02]",
                isToday && "bg-primary/[0.04]"
              )}>
                {day && (
                  <div className="flex justify-between items-center mb-1">
                    <span className={cn(
                      "w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition-all",
                      isToday ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-text-muted"
                    )}>
                      {day}
                    </span>
                    {dayItems.length > 0 && (
                      <span className="text-[9px] font-semibold text-primary px-1.5 py-0.5 bg-[var(--primary-light)] rounded-md uppercase">
                        {dayItems.length} Records
                      </span>
                    )}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto space-y-1.5 no-scrollbar">
                  {dayItems.slice(0, 4).map((item) => (
                    <button
                      key={item._id}
                      onClick={() => onItemClick?.(item)}
                      className="w-full text-left p-2 rounded-lg bg-card border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all group flex flex-col gap-0.5"
                    >
                      <span className="text-xs font-bold text-text-main truncate leading-tight group-hover:text-primary">
                        {titleField ? item[titleField] : (item.firstName || item.lastName ? `${item.firstName || ''} ${item.lastName || ''}` : item.name || item.title || 'Untitled')}
                      </span>
                      <div className="flex items-center gap-1 opacity-60">
                        <Clock size={8} />
                        <span className="text-[8px] font-medium">
                          {new Date(item[dateField]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </button>
                  ))}
                  {dayItems.length > 4 && (
                    <div className="text-[9px] font-bold text-text-muted text-center py-1 bg-surface-dim/30 rounded-md">
                      + {dayItems.length - 4} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
