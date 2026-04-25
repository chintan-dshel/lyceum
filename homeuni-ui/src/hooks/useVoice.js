import { useState, useRef, useCallback, useEffect } from 'react';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const isSupported = !!SpeechRecognition && !!window.speechSynthesis;

/**
 * Voice input/output hook for the Professor panel.
 *
 * Usage:
 *   const { supported, listening, startListening, stopListening, speak, cancelSpeech } = useVoice({ onTranscript });
 *
 * onTranscript(text, isFinal) — called with interim and final transcripts.
 * speak(text) — speaks text via SpeechSynthesis. No-op if voiceMode is off.
 */
export function useVoice({ onTranscript, voiceMode }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    clearTimeout(silenceTimerRef.current);
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported || listening) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      clearTimeout(silenceTimerRef.current);

      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }

      if (final) {
        onTranscript(final, true);
        // Auto-submit after final result — 800ms pause gives user a chance to continue
        silenceTimerRef.current = setTimeout(() => stopListening(), 800);
      } else if (interim) {
        onTranscript(interim, false);
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'aborted') console.warn('[Voice] Recognition error:', e.error);
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognition.start();
    setListening(true);
  }, [listening, onTranscript, stopListening]);

  // Cancel ongoing speech
  const cancelSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
  }, []);

  // Speak text when voice mode is on
  const speak = useCallback((text) => {
    if (!voiceMode || !window.speechSynthesis || !text) return;
    cancelSpeech();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1;
    // Prefer a natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang === 'en-US' && v.localService) || voices[0];
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);
  }, [voiceMode, cancelSpeech]);

  // Load voices asynchronously (Chrome requires this)
  useEffect(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      clearTimeout(silenceTimerRef.current);
      cancelSpeech();
    };
  }, [cancelSpeech]);

  return { supported: isSupported, listening, startListening, stopListening, speak, cancelSpeech };
}
