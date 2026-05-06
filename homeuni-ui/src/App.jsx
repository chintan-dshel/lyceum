import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';

import OnboardingView from './views/OnboardingView.jsx';
import LoginView from './views/LoginView.jsx';
import RegisterView from './views/RegisterView.jsx';
import DashboardView from './views/DashboardView.jsx';
import SemesterView from './views/SemesterView.jsx';
import CourseView from './views/CourseView.jsx';
import LessonView from './views/LessonView.jsx';
import AssignmentView from './views/AssignmentView.jsx';
import ExamView from './views/ExamView.jsx';
import TranscriptView from './views/TranscriptView.jsx';
import GradebookView from './views/GradebookView.jsx';
import StudyGroupView from './views/StudyGroupView.jsx';
import CertificateView from './views/CertificateView.jsx';
import KnowledgeGraphView from './views/KnowledgeGraphView.jsx';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading Lyceum...</div>;
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading Lyceum...</div>;
  return user ? <Navigate to="/dashboard" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<PublicRoute><LoginView /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterView /></PublicRoute>} />

          {/* Onboarding (authenticated, but no program yet) */}
          <Route path="/onboarding" element={<PrivateRoute><OnboardingView /></PrivateRoute>} />

          {/* Main app */}
          <Route path="/dashboard" element={<PrivateRoute><DashboardView /></PrivateRoute>} />
          <Route path="/program/:programId/semester/:semesterNumber" element={<PrivateRoute><SemesterView /></PrivateRoute>} />
          <Route path="/program/:programId/course/:courseId" element={<PrivateRoute><CourseView /></PrivateRoute>} />
          <Route path="/program/:programId/lesson/:lessonId" element={<PrivateRoute><LessonView /></PrivateRoute>} />
          <Route path="/program/:programId/assignment/:assignmentId" element={<PrivateRoute><AssignmentView /></PrivateRoute>} />
          <Route path="/program/:programId/exam/:examId" element={<PrivateRoute><ExamView /></PrivateRoute>} />
          <Route path="/program/:programId/transcript" element={<PrivateRoute><TranscriptView /></PrivateRoute>} />
          <Route path="/program/:programId/gradebook" element={<PrivateRoute><GradebookView /></PrivateRoute>} />
          <Route path="/program/:programId/study" element={<PrivateRoute><StudyGroupView /></PrivateRoute>} />
          <Route path="/program/:programId/knowledge-graph" element={<PrivateRoute><KnowledgeGraphView /></PrivateRoute>} />

          {/* Public certificate verification */}
          <Route path="/certificate/:code" element={<CertificateView />} />

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
