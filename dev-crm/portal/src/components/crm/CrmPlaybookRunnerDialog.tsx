"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, Phone } from "lucide-react";
import { CRM_API_URL } from "@/lib/api/config";
import { toast } from "sonner";
import {
  PLAYBOOK_CALL_OUTCOMES,
} from "@/lib/crm/playbook-ui";
import type { PlaybookRunnerQuestionForm } from "@/lib/crm/playbook-types";
import { cn } from "@/lib/utils";

const OUTCOMES = [...PLAYBOOK_CALL_OUTCOMES];

export default function CrmPlaybookRunnerDialog({
  open,
  onOpenChange,
  playbookId,
  playbookName,
  relatedTo,
  relatedType,
  questions,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  playbookId: string;
  playbookName: string;
  relatedTo: string;
  relatedType: string;
  questions: PlaybookRunnerQuestionForm[];
  onComplete?: () => void;
}) {
  const sorted = useMemo(
    () => [...questions].sort((a, b) => a.order - b.order),
    [questions],
  );
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [callOutcome, setCallOutcome] = useState<string>(OUTCOMES[0]);
  const [callOutcomeNote, setCallOutcomeNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setAnswers({});
      setCallOutcome(OUTCOMES[0]);
      setCallOutcomeNote("");
    }
  }, [open]);

  const outcomeOnly = sorted.length === 0;
  const isOutcomeStep = outcomeOnly || step >= sorted.length;
  const totalSteps = outcomeOnly ? 1 : sorted.length + 1;
  const onQuestionStep = !isOutcomeStep;
  const currentQ = sorted[step];

  const setAnswer = (id: string, v: unknown) => {
    setAnswers((a) => ({ ...a, [id]: v }));
  };

  const submit = async () => {
    setSubmitting(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${CRM_API_URL}/crm/playbooks/${playbookId}/runner/submit`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            relatedTo,
            relatedType,
            answers,
            callOutcome,
            callOutcomeNote: callOutcomeNote.trim() || undefined,
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Submit failed");
      }
      toast.success("Playbook saved — CRM updated and call logged");
      onOpenChange(false);
      onComplete?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col gap-0 overflow-hidden border-[var(--border-color)] p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-[var(--border-color)] bg-[var(--background)] px-5 py-4 text-left">
          <div className="flex items-center gap-2 text-[var(--hs-link)]">
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]">
              Live playbook
            </span>
          </div>
          <DialogTitle className="text-left text-lg font-semibold text-[var(--text-main)]">
            {playbookName}
          </DialogTitle>
          <p className="text-xs text-[var(--text-muted)]">
            {outcomeOnly
              ? "Log call outcome"
              : `Step ${isOutcomeStep ? sorted.length + 1 : step + 1} of ${totalSteps}`}
          </p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {onQuestionStep && currentQ ? (
            <div className="space-y-4">
              <p className="text-sm font-medium leading-snug text-[var(--text-main)]">
                {currentQ.prompt}
              </p>
              {currentQ.answerType === "text" && (
                <textarea
                  className="min-h-[120px] w-full rounded-md border border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-main)] outline-none focus:border-[var(--hs-link)]"
                  value={String(answers[currentQ.id] ?? "")}
                  onChange={(e) => setAnswer(currentQ.id, e.target.value)}
                  placeholder="Type the answer…"
                />
              )}
              {currentQ.answerType === "dropdown" && (
                <select
                  className="w-full rounded-md border border-[var(--border-color)] bg-white px-3 py-2.5 text-sm text-[var(--text-main)]"
                  value={String(answers[currentQ.id] ?? "")}
                  onChange={(e) => setAnswer(currentQ.id, e.target.value)}
                >
                  <option value="">Select…</option>
                  {(currentQ.options || []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
              {currentQ.answerType === "checkbox" && (
                <ul className="space-y-2">
                  {(currentQ.options || []).map((o) => {
                    const cur = Array.isArray(answers[currentQ.id])
                      ? (answers[currentQ.id] as string[])
                      : [];
                    const checked = cur.includes(o);
                    return (
                      <li key={o}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-main)]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? cur.filter((x) => x !== o)
                                : [...cur, o];
                              setAnswer(currentQ.id, next);
                            }}
                            className="h-4 w-4 rounded border-[var(--border-color)]"
                          />
                          {o}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {currentQ.crmFieldPath ? (
                <p className="text-xs text-[var(--primary-muted)]">
                  Maps to {currentQ.crmTarget} field{" "}
                  <code className="rounded bg-[var(--surface-dim)] px-1">{currentQ.crmFieldPath}</code>
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {outcomeOnly ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No live questions on this playbook — submit to log the call outcome
                  and optional notes.
                </p>
              ) : null}
              <p className="text-sm font-semibold text-[var(--text-main)]">Call outcome</p>
              <div className="space-y-2">
                {OUTCOMES.map((o) => (
                  <label
                    key={o}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      callOutcome === o
                        ? "border-[var(--hs-link)] bg-[#e0f4f7]"
                        : "border-[var(--border-color)] hover:bg-[var(--background)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="outcome"
                      checked={callOutcome === o}
                      onChange={() => setCallOutcome(o)}
                      className="h-4 w-4"
                    />
                    {o}
                  </label>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
                  Outcome notes (optional)
                </label>
                <textarea
                  className="min-h-[72px] w-full rounded-md border border-[var(--border-color)] px-3 py-2 text-sm"
                  value={callOutcomeNote}
                  onChange={(e) => setCallOutcomeNote(e.target.value)}
                  placeholder="Next steps, objections, etc."
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-[var(--border-color)] bg-[var(--background)] px-5 py-4 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="border-[var(--border-color)]"
            disabled={step === 0 || submitting || outcomeOnly || isOutcomeStep}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
          <div className="flex gap-2">
            {onQuestionStep ? (
              <Button
                type="button"
                className="bg-[var(--hs-link)] hover:bg-[#ff8f69]"
                disabled={submitting}
                onClick={() => setStep((s) => s + 1)}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                className="bg-[var(--hs-link)] hover:bg-[#ff8f69]"
                disabled={submitting || !callOutcome}
                onClick={() => void submit()}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Finish & log call"
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
