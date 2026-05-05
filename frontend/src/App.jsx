import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";

import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { getDefaultRouteByRole } from "./lib/routes";
import Login from "./pages/Login";
import AdminGradesPage from "./pages/admin/AdminGradesPage";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminStatsPage from "./pages/admin/AdminStatsPage";
import AdminStudentsPage from "./pages/admin/AdminStudentsPage";
import AdminSubjectsPage from "./pages/admin/AdminSubjectsPage";
import StudentGradesPage from "./pages/student/StudentGradesPage";
import StudentLayout from "./pages/student/StudentLayout";
import StudentOverviewPage from "./pages/student/StudentOverviewPage";
import TeacherDashboardPage from "./pages/teacher/TeacherDashboardPage";
import TeacherGradesPage from "./pages/teacher/TeacherGradesPage";
import TeacherLayout from "./pages/teacher/TeacherLayout";

const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: "2rem" }}>Chargement...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={getDefaultRouteByRole(user.role)} replace />;
};

const DashboardRedirect = () => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={getDefaultRouteByRole(user.role)} replace />;
};

function App() {
  return (
    <Router>
      <div className="app-container">
        <Navbar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardRedirect />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/admin/stats" replace />} />
              <Route path="stats" element={<AdminStatsPage />} />
              <Route path="students" element={<AdminStudentsPage />} />
              <Route path="subjects" element={<AdminSubjectsPage />} />
              <Route path="grades" element={<AdminGradesPage />} />
            </Route>
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={["teacher"]}>
                  <TeacherLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/teacher/dashboard" replace />} />
              <Route path="dashboard" element={<TeacherDashboardPage />} />
              <Route path="grades" element={<TeacherGradesPage />} />
            </Route>
            <Route path="/teacher/home" element={<Navigate to="/teacher/dashboard" replace />} />
            <Route
              path="/student"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <StudentLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/student/overview" replace />} />
              <Route path="overview" element={<StudentOverviewPage />} />
              <Route path="grades" element={<StudentGradesPage />} />
            </Route>
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
