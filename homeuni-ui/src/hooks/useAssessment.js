import { useState, useEffect, useCallback, useRef } from 'react';
import { assignments, exams } from '../lib/api.js';

export function useAssignments(courseId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refetch = useCallback(() => {
    if (!courseId) return;
    assignments.list(courseId)
      .then(({ assignments: list }) => { if (mountedRef.current) setData(list); })
      .catch(() => {});
  }, [courseId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!courseId) return;
    assignments.list(courseId)
      .then(({ assignments: list }) => { if (mountedRef.current) setData(list); })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, [courseId]);

  return { assignments: data, loading, refetch };
}

export function useAssignment(assignmentId) {
  const [assignment, setAssignment] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    if (!assignmentId) return;
    Promise.all([
      assignments.get(assignmentId),
      assignments.submissions(assignmentId),
    ]).then(([{ assignment }, { submissions }]) => {
      setAssignment(assignment);
      setSubmissions(submissions);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [assignmentId]);

  const submit = useCallback(async (content_text) => {
    if (!assignmentId || !content_text.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await assignments.submit(assignmentId, content_text);
      setSubmissions(s => [result.submission, ...s]);
      setLastResult(result.feedback);
      return result.feedback;
    } catch (err) {
      throw err; // let the view handle the error
    } finally {
      setSubmitting(false);
    }
  }, [assignmentId, submitting]);

  return { assignment, submissions, loading, submitting, lastResult, submit };
}

export function useExams(courseId) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refetch = useCallback(() => {
    if (!courseId) return;
    exams.list(courseId)
      .then(({ exams: list }) => { if (mountedRef.current) setData(list); })
      .catch(() => {});
  }, [courseId]);

  useEffect(() => {
    mountedRef.current = true;
    if (!courseId) return;
    exams.list(courseId)
      .then(({ exams: list }) => { if (mountedRef.current) setData(list); })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false); });
    return () => { mountedRef.current = false; };
  }, [courseId]);

  return { exams: data, loading, refetch };
}

export function useExam(examId) {
  const [exam, setExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [currentAttempt, setCurrentAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!examId) return;
    Promise.all([
      exams.get(examId),
      exams.attempts(examId),
    ]).then(([{ exam }, { attempts }]) => {
      setExam(exam);
      setAttempts(attempts);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [examId]);

  const startAttempt = useCallback(async () => {
    const { attempt } = await exams.startAttempt(examId);
    setCurrentAttempt(attempt);
    setAnswers({});
    return attempt;
  }, [examId]);

  const setAnswer = useCallback((questionId, value) => {
    setAnswers(a => ({ ...a, [questionId]: value }));
  }, []);

  const submitExam = useCallback(async () => {
    if (!currentAttempt || submitting) return;
    setSubmitting(true);
    try {
      const data = await exams.submit(examId, { attemptId: currentAttempt.id, answers });
      setAttempts(a => [data.attempt, ...a]);
      setResult({ score: data.score, gradeLetter: data.gradeLetter, feedback: data.feedback });
      setCurrentAttempt(null);
      return data;
    } finally {
      setSubmitting(false);
    }
  }, [examId, currentAttempt, answers, submitting]);

  return {
    exam, attempts, currentAttempt, answers, loading,
    submitting, result,
    startAttempt, setAnswer, submitExam,
  };
}
