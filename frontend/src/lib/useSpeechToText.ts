import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface UseSpeechToTextOptions {
  lang?: string;
  onFinalText: (text: string) => void;
}

const getSpeechRecognitionCtor = (): (new () => SpeechRecognition) | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
};

export const useSpeechToText = ({ lang, onFinalText }: UseSpeechToTextOptions) => {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const supported = useMemo(() => Boolean(getSpeechRecognitionCtor()), []);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      setListening(false);
      setInterimText("");
      return;
    }
    try {
      recognition.stop();
    } catch {
      // Ignore stop errors; onend will reset state.
    }
  }, []);

  const start = useCallback(() => {
    if (!supported || listening) {
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    setError(null);
    setInterimText("");

    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang ?? "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let finalized = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result) continue;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalized += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      setInterimText(interim.trim());
      const cleanedFinal = finalized.trim();
      if (cleanedFinal) {
        onFinalText(cleanedFinal);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(event.message ?? event.error ?? "Speech recognition error.");
      setListening(false);
      setInterimText("");
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      setInterimText("");
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start speech recognition.");
      setListening(false);
      setInterimText("");
      recognitionRef.current = null;
    }
  }, [lang, listening, onFinalText, supported]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        // Ignore abort errors on teardown.
      }
      recognitionRef.current = null;
    };
  }, []);

  return { supported, listening, interimText, error, start, stop };
};

