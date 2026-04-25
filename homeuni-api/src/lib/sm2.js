/**
 * SM-2 spaced repetition algorithm
 * quality: 0-5 (0-2 = fail, 3-5 = pass)
 * Returns the updated card state.
 */
export function sm2({ easiness = 2.5, intervalDays = 0, repetitions = 0 }, quality) {
  const q = Math.max(0, Math.min(5, Math.round(quality)));

  let newEF = easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  newEF = Math.max(1.3, newEF);

  let newReps, newInterval;
  if (q < 3) {
    newReps = 0;
    newInterval = 1;
  } else {
    newReps = repetitions + 1;
    if (newReps === 1)      newInterval = 1;
    else if (newReps === 2) newInterval = 6;
    else                    newInterval = Math.round(intervalDays * newEF);
  }

  const due = new Date();
  due.setDate(due.getDate() + newInterval);

  return {
    easiness: parseFloat(newEF.toFixed(2)),
    intervalDays: newInterval,
    repetitions: newReps,
    dueDate: due.toISOString().slice(0, 10),
  };
}
