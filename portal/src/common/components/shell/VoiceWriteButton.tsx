"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  createSpeechRecognitionSession,
  insertTextIntoEditable,
  isSpeechToTextSupported,
} from "@/lib/speech-to-text";

type VoiceWriteButtonProps = {
  /** Prefer inserting into this element when provided. */
  targetRef?: React.RefObject<HTMLElement | null>;
  className?: string;
  size?: "sm" | "md";
};

/** Inline mic button for a specific field (optional; global FAB covers most cases). */
export function VoiceWriteButton({
  targetRef,
  className,
  size = "sm",
}: VoiceWriteButtonProps) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const sessionRef = useRef<ReturnType<
    typeof createSpeechRecognitionSession
  > | null>(null);

  useEffect(() => {
    setSupported(isSpeechToTextSupported());
  }, []);

  useEffect(() => {
    return () => {
      try {
        sessionRef.current?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  const stop = useCallback(() => {
    setListening(false);
    try {
      sessionRef.current?.stop();
    } catch {
      // ignore
    }
    sessionRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!isSpeechToTextSupported()) {
      toast.error("Voice write needs Chrome or Edge.");
      return;
    }
    const target =
      targetRef?.current ||
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    if (!target) {
      toast.message("Focus the field first.");
      return;
    }

    const session = createSpeechRecognitionSession({
      continuous: true,
      lang:
        typeof navigator !== "undefined"
          ? navigator.language || "en-US"
          : "en-US",
      onTranscript: (text, isFinal) => {
        if (!isFinal) return;
        insertTextIntoEditable(
          target,
          text.endsWith(" ") ? text : `${text} `,
        );
      },
      onError: (message) => {
        toast.error(message);
        stop();
      },
    });
    sessionRef.current = session;
    setListening(true);
    session.start();
  }, [stop, targetRef]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (listening ? stop() : start())}
      title={listening ? "Stop voice write" : "Voice write"}
      aria-pressed={listening}
      className={cn(
        "inline-flex items-center justify-center rounded-md border transition-colors",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        listening
          ? "border-rose-300 bg-rose-50 text-rose-700"
          : "border-[var(--border-color)] bg-white text-[var(--text-muted)] hover:text-[var(--hs-link)]",
        className,
      )}
    >
      {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
    </button>
  );
}
