import { useState, useEffect } from 'react';
import { telemetry } from '../lib/api.js';

export function useTelemetrySummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    telemetry.summary()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}

export function useProgramTelemetry(programId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!programId) return;
    telemetry.program(programId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [programId]);

  // Map from courseId → total_cost_usd for fast lookup in CourseCard
  const costByCourse = {};
  if (data?.courses) {
    for (const c of data.courses) {
      costByCourse[c.course_id] = parseFloat(c.total_cost_usd) || 0;
    }
  }

  return { data, loading, costByCourse, programTotal: data?.program_total_usd ?? null };
}
