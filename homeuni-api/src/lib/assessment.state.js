export const MAX_ASSIGNMENTS = 2;
export const MAX_EXAMS = 2;

// Shared in-flight guards — imported by both curriculum.js and lessons.js
// so neither trigger can double-generate the same position concurrently.
export const generatingAssignments = new Set(); // courseId
export const generatingExams = new Set();       // courseId
