'use client';

import { Enrollment, Course } from '@/types/lms';

interface ProgressTrackerProps {
  enrollment: Enrollment;
  course: Course;
}

export default function ProgressTracker({ enrollment, course }: ProgressTrackerProps) {
  const completionPercent = enrollment.progress?.completionPercentage || 0;
  const timeSpent = enrollment.metrics?.totalTimeSpentMinutes || 0;
  const accessCount = enrollment.metrics?.accessCount || 0;

  const totalLessons = course.sections?.reduce(
    (acc, s) => acc + (s.lessons?.length || 0),
    0
  ) || 0;

  const completedLessons = enrollment.progress?.completedLessons?.length || 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50';
      case 'in_progress':
        return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50';
      case 'not_started':
        return 'bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700';
      default:
        return 'bg-gray-50 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300';
      case 'in_progress':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300';
      case 'not_started':
        return 'bg-gray-100 dark:bg-zinc-700 text-gray-800 dark:text-zinc-200';
      default:
        return 'bg-gray-100 dark:bg-zinc-700 text-gray-800 dark:text-zinc-200';
    }
  };

  return (
    <div className={`border rounded-lg p-6 ${getStatusColor(enrollment.status)}`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{course.title}</h3>
          <p className="text-sm text-slate-600 dark:text-zinc-400 mt-1">
            Enrolled on {new Date(enrollment.enrolledAt).toLocaleDateString()}
          </p>
        </div>
        <span className={`px-4 py-2 rounded-full text-sm font-bold ${getStatusBadgeColor(enrollment.status)}`}>
          {enrollment.status.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Overall Progress</label>
          <span className="text-lg font-bold text-slate-900 dark:text-white">{completionPercent}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-300 ${
              completionPercent === 100 ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${completionPercent}%` }}
          ></div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white dark:bg-zinc-800/60 bg-opacity-60 rounded-lg p-4">
          <p className="text-xs text-slate-600 dark:text-zinc-400 font-medium">Lessons Completed</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {completedLessons}/{totalLessons}
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-800/60 bg-opacity-60 rounded-lg p-4">
          <p className="text-xs text-slate-600 dark:text-zinc-400 font-medium">Time Spent</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {Math.floor(timeSpent / 60)}h {timeSpent % 60}m
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-800/60 bg-opacity-60 rounded-lg p-4">
          <p className="text-xs text-slate-600 dark:text-zinc-400 font-medium">Times Accessed</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{accessCount}</p>
        </div>

        <div className="bg-white dark:bg-zinc-800/60 bg-opacity-60 rounded-lg p-4">
          <p className="text-xs text-slate-600 dark:text-zinc-400 font-medium">Avg. Time/Lesson</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {enrollment.metrics?.averageTimePerLesson || 0} min
          </p>
        </div>
      </div>

      {/* Achievement Timeline */}
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">Timeline</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-zinc-400">Started:</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {new Date(enrollment.metrics?.startedAt).toLocaleDateString()}
            </span>
          </div>
          {enrollment.metrics?.lastAccessedAt && (
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-zinc-400">Last Accessed:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {new Date(enrollment.metrics.lastAccessedAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {enrollment.completedAt && (
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-zinc-400">Completed:</span>
              <span className="font-medium text-green-700 dark:text-green-400">
                {new Date(enrollment.completedAt).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Completion Message */}
      {completionPercent === 100 && (
        <div className="mt-6 bg-green-100 dark:bg-green-900/25 border border-green-300 dark:border-green-700 rounded-lg p-4 text-center">
          <p className="text-green-900 dark:text-green-300 font-semibold">
            🎉 Congratulations! You've completed all lessons.
          </p>
          <p className="text-green-800 dark:text-green-400 text-sm mt-1">
            {enrollment.isCompleted
              ? '✓ Course completed. Certificate available.'
              : 'Take the final quiz to complete this course.'}
          </p>
        </div>
      )}
    </div>
  );
}
