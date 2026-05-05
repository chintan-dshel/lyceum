-- ============================================================
-- 012 — Add 'course' to degree_type enum
--
-- The advisor agent can propose a single standalone course
-- (as opposed to a multi-semester degree program). 'course'
-- is semantically distinct from 'certificate' and 'custom'.
-- ============================================================

ALTER TYPE degree_type ADD VALUE IF NOT EXISTS 'course';
