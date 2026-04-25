import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { progress } from '../lib/api.js';
import Sidebar from '../components/Sidebar.jsx';

export default function GradebookView() {
  const { programId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    progress.gradebook(programId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [programId]);

  if (loading) return <div className="loading-screen">Loading gradebook...</div>;

  return (
    <div className="app-shell">
      <Sidebar programId={programId} />
      <div className="main-content">
        <div className="topbar">
          <div className="topbar-breadcrumb">
            <Link to="/dashboard">Dashboard</Link>
            <span className="sep">/</span>
            <span className="current">Grade Book</span>
          </div>
          <div className="topbar-actions">
            {data?.gpa > 0 && (
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--navy-800)' }}>
                GPA: {data.gpa}
              </div>
            )}
          </div>
        </div>

        <div className="page-content">
          <div className="page-header">
            <h1>Grade Book</h1>
            <p className="subtitle">Your progress across all courses. Grades are indicators to help you grow.</p>
          </div>

          {data?.gradebook?.map(semester => (
            <div key={semester.id} style={{ marginBottom: 36 }}>
              <h2 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy-600)', marginBottom: 16 }}>
                {semester.title} {semester.gpa ? `· GPA ${semester.gpa}` : ''}
              </h2>
              <table className="gradebook-table">
                <thead>
                  <tr>
                    <th>Course</th>
                    <th>Type</th>
                    <th>Assignments</th>
                    <th>Exams</th>
                    <th>Final</th>
                  </tr>
                </thead>
                <tbody>
                  {semester.courses?.map(course => (
                    <tr key={course.id}>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--navy-800)' }}>{course.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{course.code}</div>
                      </td>
                      <td><span className={`badge badge-${course.course_type === 'core' ? 'navy' : 'amber'}`}>{course.course_type}</span></td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {course.submissions?.length > 0
                          ? course.submissions.slice(0, 2).map((s, i) => (
                              <div key={i}>{s.title}: <strong>{s.score ?? '—'}</strong></div>
                            ))
                          : <span style={{ color: 'var(--text-secondary)' }}>None yet</span>
                        }
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {course.examAttempts?.length > 0
                          ? course.examAttempts.slice(0, 1).map((e, i) => (
                              <div key={i}>{e.title}: <strong>{e.score ?? '—'}</strong></div>
                            ))
                          : <span style={{ color: 'var(--text-secondary)' }}>None yet</span>
                        }
                      </td>
                      <td>
                        {course.grade_letter
                          ? <div className={`grade-chip grade-${course.grade_letter}`}>{course.grade_letter}</div>
                          : <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>In progress</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
