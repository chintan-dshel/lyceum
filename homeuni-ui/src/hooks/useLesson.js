import { useState, useEffect, useRef, useCallback } from 'react';
import { lessons } from '../lib/api.js';
import { streamProfessorChat } from '../lib/api.js';

export function useLesson(lessonId) {
  const [lesson, setLesson] = useState(null);
  const [navigation, setNavigation] = useState({ prev: null, next: null });
  const [generating, setGenerating] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const pollRef = useRef(null);

  async function fetchLesson(opts) {
    try {
      const { lesson: l, navigation: nav, generating: gen, generationFailed: failed } = await lessons.get(lessonId, opts);
      if (!mountedRef.current) return null;
      setLesson(l);
      setNavigation(nav);
      setGenerating(!!gen);
      setGenerationFailed(!!failed);
      return { generating: !!gen, generationFailed: !!failed };
    } catch (err) {
      if (mountedRef.current) setError(err.message);
      return null;
    }
  }

  useEffect(() => {
    if (!lessonId) return;
    mountedRef.current = true;
    setLesson(null); // clear stale lesson so isComplete doesn't bleed across navigation
    setLoading(true);
    setGenerating(false);
    setGenerationFailed(false);
    fetchLesson().finally(() => {
      if (mountedRef.current) setLoading(false);
    });
    return () => {
      mountedRef.current = false;
      clearTimeout(pollRef.current);
    };
  }, [lessonId]);

  // Poll every 3s while generating — stop on success or failure
  useEffect(() => {
    if (!generating) { clearTimeout(pollRef.current); return; }
    function scheduleNext() {
      pollRef.current = setTimeout(async () => {
        const result = await fetchLesson();
        if (mountedRef.current && result?.generating && !result?.generationFailed) scheduleNext();
      }, 3000);
    }
    scheduleNext();
    return () => clearTimeout(pollRef.current);
  }, [generating, lessonId]);

  const retry = useCallback(async () => {
    clearTimeout(pollRef.current);
    setGenerationFailed(false);
    setGenerating(true);
    await fetchLesson({ retry: true });
  }, [lessonId]);

  return { lesson, navigation, generating, generationFailed, loading, error, retry };
}

// Track time spent and scroll depth for difficulty signals.
// Sets lesson to in_progress when content is available.
// Completion is manual — call markComplete() from the UI.
export function useLessonTracking(lessonId, estimatedMinutes, hasContent = false) {
  const startTimeRef = useRef(Date.now());
  const scrollDepthRef = useRef(0);
  const reportedRef = useRef(false);
  const startedRef = useRef(false);
  const [nextGenerating, setNextGenerating] = useState(false);

  // Mark in_progress once content is available
  useEffect(() => {
    if (!lessonId || !hasContent || startedRef.current) return;
    startedRef.current = true;
    lessons.start(lessonId).catch(() => {});
  }, [lessonId, hasContent]);

  useEffect(() => {
    if (!lessonId) return;
    startTimeRef.current = Date.now();
    reportedRef.current = false;
    startedRef.current = false;
    setNextGenerating(false);

    const handleScroll = () => {
      const el = document.documentElement;
      const pct = Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100);
      scrollDepthRef.current = Math.max(scrollDepthRef.current, pct || 0);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    const reportVisit = () => {
      if (reportedRef.current) return;
      reportedRef.current = true;
      const timeSpentSecs = Math.round((Date.now() - startTimeRef.current) / 1000);
      lessons.visit(lessonId, { timeSpentSecs, scrollDepth: scrollDepthRef.current })
        .catch(() => {});
    };

    const visitTimer = setTimeout(reportVisit, 120000);

    return () => {
      clearTimeout(visitTimer);
      window.removeEventListener('scroll', handleScroll);
      reportVisit();
    };
  }, [lessonId]);

  const markComplete = useCallback(() => {
    return lessons.complete(lessonId)
      .then(({ nextLesson }) => { if (nextLesson?.generating) setNextGenerating(true); })
      .catch(() => {});
  }, [lessonId]);

  return { nextGenerating, markComplete };
}

// Professor chat with streaming support
export function useProfessorChat(lessonId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const stopStreamRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopStreamRef.current?.(); // abort any in-progress stream on unmount
    };
  }, []);

  useEffect(() => {
    if (!lessonId) return;
    setLoading(true);
    lessons.professorHistory(lessonId)
      .then(({ messages }) => setMessages(messages))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lessonId]);

  const sendingRef = useRef(false);
  const sendMessage = useCallback(async (text, stream = true) => {
    if (!text.trim() || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);

    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages(m => [...m, userMsg]);

    if (stream) {
      setStreamingMessage('');
      let fullText = '';

      stopStreamRef.current = streamProfessorChat(
        lessonId,
        text,
        (chunk) => {
          if (!mountedRef.current) return;
          fullText += chunk;
          setStreamingMessage(fullText);
        },
        () => {
          if (!mountedRef.current) return;
          setMessages(m => [...m, { role: 'assistant', content: fullText, created_at: new Date().toISOString() }]);
          setStreamingMessage('');
          sendingRef.current = false;
          setSending(false);
        }
      );
    } else {
      try {
        const { message } = await lessons.professorChat(lessonId, text);
        if (mountedRef.current) {
          setMessages(m => [...m, { role: 'assistant', content: message, created_at: new Date().toISOString() }]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        sendingRef.current = false;
        if (mountedRef.current) setSending(false);
      }
    }
  }, [lessonId]);

  const reportStruggling = useCallback(() => {
    lessons.struggling(lessonId).catch(() => {});
  }, [lessonId]);

  return { messages, loading, sending, streamingMessage, sendMessage, reportStruggling };
}
