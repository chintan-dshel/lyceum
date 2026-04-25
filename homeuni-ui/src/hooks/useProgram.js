import { useState, useEffect, useCallback, useRef } from 'react';
import { programs, curriculum } from '../lib/api.js';

export function usePrograms() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setLoading(true);
    programs.list()
      .then(({ programs: list }) => setData(list))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  return { programs: data, loading, error, refresh };
}

export function useProgram(programId) {
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    if (!programId) return;
    setLoading(true);
    programs.get(programId)
      .then(({ program }) => setProgram(program))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [programId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { program, loading, error, refresh };
}

export function useCurriculum(programId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCurriculum = useCallback(() => {
    if (!programId) return;
    curriculum.get(programId)
      .then(d => { setData(d); setError(null); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [programId]);

  useEffect(() => {
    setLoading(true);
    fetchCurriculum();
  }, [fetchCurriculum]);

  return { curriculum: data, loading, error };
}

// Poll program status until it becomes 'active' (after curriculum generation)
// Returns: 'generating' | 'active' | 'failed' | null
export function useProgramStatus(programId, onReady) {
  const [status, setStatus] = useState(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    if (!programId) return;
    let cancelled = false;

    const poll = async () => {
      while (!cancelled) {
        try {
          const data = await programs.status(programId);
          if (data.ready) {
            setStatus('active');
            onReadyRef.current?.();
            return;
          }
          // If status rolled back to 'onboarding', generation failed
          if (data.status === 'onboarding') {
            setStatus('failed');
            return;
          }
          setStatus(data.status);
        } catch { /* continue polling on network errors */ }
        await new Promise(r => setTimeout(r, 3000));
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [programId]);

  return status;
}

export function useNudges(programId) {
  const [nudges, setNudges] = useState([]);

  useEffect(() => {
    if (!programId) return;
    programs.nudges(programId)
      .then(({ nudges }) => setNudges(nudges))
      .catch(() => {});

    const interval = setInterval(() => {
      programs.nudges(programId)
        .then(({ nudges }) => setNudges(nudges))
        .catch(() => {});
    }, 60000); // poll every minute

    return () => clearInterval(interval);
  }, [programId]);

  const dismiss = useCallback(async (nudgeId) => {
    await programs.dismissNudge(nudgeId).catch(() => {});
    setNudges(n => n.filter(x => x.id !== nudgeId));
  }, []);

  return { nudges, dismiss };
}
