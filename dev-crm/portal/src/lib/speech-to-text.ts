"use client";

export type SpeechToTextStatus =
  | "unsupported"
  | "idle"
  | "listening"
  | "error";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechToTextSupported(): boolean {
  return !!getSpeechRecognitionCtor();
}

export function isEditableTarget(el: EventTarget | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "text").toLowerCase();
    return ![
      "button",
      "checkbox",
      "radio",
      "file",
      "submit",
      "reset",
      "image",
      "hidden",
      "range",
      "color",
      "date",
      "datetime-local",
      "month",
      "time",
      "week",
    ].includes(type);
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if (el.isContentEditable) return true;
  return !!el.closest('[contenteditable="true"]');
}

function resolveEditableRoot(el: HTMLElement): HTMLElement {
  if (el.isContentEditable) return el;
  const nested = el.closest('[contenteditable="true"]');
  return nested instanceof HTMLElement ? nested : el;
}

/** Insert text into an input/textarea/contentEditable and notify React. */
export function insertTextIntoEditable(
  target: HTMLElement,
  text: string,
): boolean {
  if (!text) return false;
  const el = resolveEditableRoot(target);

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`;
    const proto = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    );
    proto?.set?.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const caret = start + text.length;
    try {
      el.setSelectionRange(caret, caret);
    } catch {
      // some input types reject selection
    }
    el.focus({ preventScroll: true });
    return true;
  }

  if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
    el.focus({ preventScroll: true });
    try {
      if (document.execCommand("insertText", false, text)) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
    } catch {
      // fall through
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
  }

  return false;
}

export type UseSpeechToTextOptions = {
  lang?: string;
  continuous?: boolean;
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
};

export function createSpeechRecognitionSession(
  options: UseSpeechToTextOptions = {},
): {
  supported: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
} {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    return {
      supported: false,
      start: () => undefined,
      stop: () => undefined,
      abort: () => undefined,
    };
  }

  let recognition: SpeechRecognitionLike | null = null;

  const ensure = () => {
    if (recognition) return recognition;
    recognition = new Ctor();
    recognition.continuous = options.continuous !== false;
    recognition.interimResults = true;
    recognition.lang = options.lang || "en-US";
    recognition.onresult = (event) => {
      let chunk = "";
      let isFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        chunk += result[0]?.transcript || "";
        if (result.isFinal) isFinal = true;
      }
      const text = chunk.trim();
      if (text) options.onTranscript?.(isFinal ? `${text} ` : text, isFinal);
    };
    recognition.onerror = (event) => {
      const code = String(event?.error || "error");
      if (code === "aborted" || code === "no-speech") return;
      options.onError?.(
        code === "not-allowed"
          ? "Microphone permission denied."
          : `Voice write error: ${code}`,
      );
    };
    recognition.onend = () => {
      options.onEnd?.();
    };
    return recognition;
  };

  return {
    supported: true,
    start: () => {
      try {
        ensure().start();
      } catch {
        // Already started
      }
    },
    stop: () => {
      try {
        recognition?.stop();
      } catch {
        // ignore
      }
    },
    abort: () => {
      try {
        recognition?.abort();
      } catch {
        // ignore
      }
    },
  };
}
