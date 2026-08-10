'use client';

import { useState, useEffect } from 'react';
import { Quiz, QuizSubmission } from '@/types/lms';

interface QuizInterfaceProps {
  quiz: Quiz;
  enrollmentId: string;
  onSubmit?: (submission: QuizSubmission) => void;
}

export default function QuizInterface({
  quiz,
  enrollmentId,
  onSubmit,
}: QuizInterfaceProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(quiz.timeLimitMinutes ? quiz.timeLimitMinutes * 60 : null);
  const [loading, setLoading] = useState(false);

  // Timer
  useEffect(() => {
    if (!timeLeft) return;

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev && prev <= 1) {
          handleSubmit();
          return 0;
        }
        return prev ? prev - 1 : 0;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timeLeft]);

  const handleAnswerChange = (questionId: string, value: string | string[]) => {
    setAnswers({
      ...answers,
      [questionId]: value,
    });
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const submissionAnswers = quiz.questions.map((q) => ({
        questionId: q._id,
        answer: answers[q._id] || '',
      }));

      const response = await fetch(`/api/lms/quizzes/submissions/${enrollmentId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quizId: quiz._id,
          answers: submissionAnswers,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit quiz');
      const submission = await response.json();
      setSubmitted(true);
      onSubmit?.(submission);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit quiz');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-zinc-800 rounded-lg shadow-md p-8 text-center">
        <div className="text-6xl mb-4">✓</div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Quiz Submitted</h2>
        <p className="text-slate-600 dark:text-zinc-300 mb-6">
          Your quiz has been submitted successfully. Results will be available shortly.
        </p>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
        >
          Back to Course
        </button>
      </div>
    );
  }

  const question = quiz.questions[currentQuestion];
  const progress = ((currentQuestion + 1) / quiz.questions.length) * 100;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{quiz.title}</h2>
          {timeLeft !== null && (
            <div className={`text-lg font-bold ${timeLeft < 300 ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-zinc-300'}`}>
              ⏱️ {formatTime(timeLeft)}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-600 dark:text-zinc-300">
              Question {currentQuestion + 1} of {quiz.questions.length}
            </span>
            <span className="text-slate-600 dark:text-zinc-300">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-zinc-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-md p-8 mb-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
          {question.questionText}
        </h3>

        {question.imageUrl && (
          <img
            src={question.imageUrl}
            alt="Question"
            className="mb-6 max-w-full rounded-lg"
          />
        )}

        {/* Answer Options */}
        <div className="space-y-3">
          {question.questionType === 'multiple_choice' && (
            <div className="space-y-2">
              {question.options?.map((option) => (
                <label key={option._id} className="flex items-center p-3 border border-slate-200 dark:border-zinc-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-700 dark:text-zinc-100">
                  <input
                    type="checkbox"
                    value={option.text}
                    checked={(answers[question._id] as string[])?.includes(option.text) || false}
                    onChange={(e) => {
                      const current = (answers[question._id] as string[]) || [];
                      if (e.target.checked) {
                        handleAnswerChange(question._id, [...current, option.text]);
                      } else {
                        handleAnswerChange(question._id, current.filter((a) => a !== option.text));
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <span className="ml-3">{option.text}</span>
                </label>
              ))}
            </div>
          )}

          {question.questionType === 'true_false' && (
            <div className="space-y-2">
              {['True', 'False'].map((value) => (
                <label key={value} className="flex items-center p-3 border border-slate-200 dark:border-zinc-600 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-700 dark:text-zinc-100">
                  <input
                    type="radio"
                    name={question._id}
                    value={value}
                    checked={answers[question._id] === value}
                    onChange={(e) => handleAnswerChange(question._id, e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="ml-3">{value}</span>
                </label>
              ))}
            </div>
          )}

          {question.questionType === 'short_answer' && (
            <input
              type="text"
              value={answers[question._id] as string || ''}
              onChange={(e) => handleAnswerChange(question._id, e.target.value)}
              placeholder="Type your answer..."
              className="w-full px-4 py-2 border border-slate-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400"
            />
          )}

          {question.questionType === 'essay' && (
            <textarea
              value={answers[question._id] as string || ''}
              onChange={(e) => handleAnswerChange(question._id, e.target.value)}
              placeholder="Type your answer..."
              rows={6}
              className="w-full px-4 py-2 border border-slate-200 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-400"
            />
          )}
        </div>

        {question.description && (
          <p className="text-sm text-slate-600 dark:text-zinc-400 mt-4 italic">{question.description}</p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex gap-4">
        <button
          onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
          disabled={currentQuestion === 0}
          className="px-6 py-3 bg-slate-300 dark:bg-zinc-700 text-slate-900 dark:text-white rounded-lg font-bold hover:bg-slate-400 dark:hover:bg-zinc-600 transition disabled:opacity-50"
        >
          Previous
        </button>

        {currentQuestion < quiz.questions.length - 1 ? (
          <button
            onClick={() => setCurrentQuestion(currentQuestion + 1)}
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? 'Submitting...' : 'Submit Quiz'}
          </button>
        )}
      </div>

      {/* Question Indicator */}
      <div className="mt-6 bg-white dark:bg-zinc-800 rounded-lg shadow-md p-4">
        <p className="text-sm text-slate-600 dark:text-zinc-400 mb-3">Jump to question:</p>
        <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
          {quiz.questions.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentQuestion(idx)}
              className={`w-8 h-8 rounded font-bold transition ${
                idx === currentQuestion
                  ? 'bg-blue-600 text-white'
                  : answers[quiz.questions[idx]._id]
                  ? 'bg-green-200 dark:bg-green-900 text-green-900 dark:text-green-100 hover:bg-green-300 dark:hover:bg-green-800'
                  : 'bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-300 dark:hover:bg-zinc-600'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
