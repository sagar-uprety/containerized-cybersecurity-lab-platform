import { useState, useEffect, useCallback } from "react";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import Overview from "./pages/Overview.jsx";
import LabDetail from "./pages/LabDetail.jsx";
import Feedback from "./pages/Feedback.jsx";
import InstructorOverview from "./pages/InstructorOverview.jsx";
import InstructorLabDetail from "./pages/InstructorLabDetail.jsx";
import InstructorGroupDetail from "./pages/InstructorGroupDetail.jsx";
import InstructorGroupStudentDetail from "./pages/InstructorGroupStudentDetail.jsx";
import InstructorGroupSessionDetail from "./pages/InstructorGroupSessionDetail.jsx";
import InstructorStudents from "./pages/InstructorStudents.jsx";
import InstructorPending from "./pages/InstructorPending.jsx";
import PasswordChange from "./pages/PasswordChange.jsx";
import ToastContainer from "./components/Toast.jsx";
import { getMe, logout } from "./api.js";

function parseRoute() {
  const path = window.location.pathname;

  const groupSessionMatch = path.match(/^\/instructor\/groups\/(\d+)\/students\/([^/]+)\/labs\/([^/]+)\/?$/);
  if (groupSessionMatch) {
    return { page: "instructor-group-session", groupId: parseInt(groupSessionMatch[1], 10), studentId: groupSessionMatch[2], labId: groupSessionMatch[3] };
  }

  const groupStudentMatch = path.match(/^\/instructor\/groups\/(\d+)\/students\/([^/]+)\/?$/);
  if (groupStudentMatch) {
    return { page: "instructor-group-student", groupId: parseInt(groupStudentMatch[1], 10), studentId: groupStudentMatch[2] };
  }

  const instructorSessionMatch = path.match(/^\/instructor\/labs\/([^/]+)\/([^/]+)\/?$/);
  if (instructorSessionMatch) {
    return { page: "instructor-session", labId: instructorSessionMatch[1], studentId: instructorSessionMatch[2] };
  }

  const instructorLabMatch = path.match(/^\/instructor\/labs\/([^/]+)\/?$/);
  if (instructorLabMatch) {
    return { page: "instructor-lab", labId: instructorLabMatch[1] };
  }

  const instructorGroupMatch = path.match(/^\/instructor\/groups\/(\d+)\/?$/);
  if (instructorGroupMatch) {
    return { page: "instructor-group-detail", groupId: parseInt(instructorGroupMatch[1], 10) };
  }

  const instructorStudentsMatch = path.match(/^\/instructor\/students\/?$/);
  if (instructorStudentsMatch) return { page: "instructor-students" };

  const instructorPendingMatch = path.match(/^\/instructor\/pending\/?$/);
  if (instructorPendingMatch) return { page: "instructor-pending" };

  const instructorLoginMatch = path.match(/^\/instructor\/login\/?$/);
  if (instructorLoginMatch) return { page: "instructor-login" };

  // Legacy routes redirect to dashboard
  if (/^\/instructor\/(manage|search)\/?$/.test(path)) return { page: "instructor" };

  const instructorMatch = path.match(/^\/instructor\/?$/);
  if (instructorMatch) return { page: "instructor" };

  const signupMatch = path.match(/^\/signup\/?$/);
  if (signupMatch) return { page: "signup" };

  const feedbackMatch = path.match(/^\/labs\/([^/]+)\/feedback\/?$/);
  if (feedbackMatch) return { page: "feedback", labId: feedbackMatch[1] };

  const detailMatch = path.match(/^\/labs\/([^/]+)\/?$/);
  if (detailMatch) return { page: "detail", labId: detailMatch[1] };

  return { page: "overview" };
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    function onPopState() { setRoute(parseRoute()); }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const navigate = useCallback((path) => {
    window.history.pushState({}, "", path);
    setRoute(parseRoute());
  }, []);

  const handleLogin = useCallback((loggedInUser) => {
    setUser(loggedInUser);
    const dest = loggedInUser.role === "instructor" ? "/instructor" : "/";
    window.history.pushState({}, "", dest);
    setRoute(parseRoute());
  }, []);

  const handleLogout = useCallback(async () => {
    const wasInstructor = user?.role === "instructor";
    try { await logout(); } catch {}
    setUser(null);
    const dest = wasInstructor ? "/instructor/login" : "/";
    window.history.pushState({}, "", dest);
    setRoute(parseRoute());
  }, [user]);

  if (checking) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#6B7280" }}>
        Loading...
      </div>
    );
  }

  if (route.page === "signup" && !user) {
    return <SignupPage onSignup={handleLogin} onSwitchToLogin={() => navigate("/")} />;
  }

  if (route.page === "instructor-login" && !user) {
    return <LoginPage mode="instructor" onLogin={handleLogin} onSwitchToLogin={() => navigate("/")} />;
  }

  if (!user) {
    return <LoginPage mode="student" onLogin={handleLogin} onSwitchToSignup={() => navigate("/signup")} onSwitchToInstructor={() => navigate("/instructor/login")} />;
  }

  if (user.must_change_password) {
    return <PasswordChange onChanged={() => setUser({ ...user, must_change_password: false })} onLogout={handleLogout} />;
  }

  if (route.page === "instructor-group-session") {
    return <><InstructorGroupSessionDetail user={user} groupId={route.groupId} studentId={route.studentId} labId={route.labId} onLogout={handleLogout} /><ToastContainer /></>;
  }
  if (route.page === "instructor-group-student") {
    return <><InstructorGroupStudentDetail user={user} groupId={route.groupId} studentId={route.studentId} onLogout={handleLogout} /><ToastContainer /></>;
  }
  if (route.page === "instructor-group-detail") {
    return <><InstructorGroupDetail user={user} groupId={route.groupId} onLogout={handleLogout} /><ToastContainer /></>;
  }
  if (route.page === "instructor-students") {
    return <><InstructorStudents user={user} onLogout={handleLogout} /><ToastContainer /></>;
  }
  if (route.page === "instructor-pending") {
    return <><InstructorPending user={user} onLogout={handleLogout} /><ToastContainer /></>;
  }
  if (route.page === "instructor") {
    return <><InstructorOverview user={user} onLogout={handleLogout} /><ToastContainer /></>;
  }
  if (route.page === "instructor-lab") {
    return <InstructorLabDetail user={user} labId={route.labId} onLogout={handleLogout} />;
  }
  if (route.page === "instructor-session") {
    return <InstructorGroupSessionDetail user={user} groupId={0} studentId={route.studentId} labId={route.labId} onLogout={handleLogout} />;
  }
  if (route.page === "feedback") {
    return <Feedback user={user} labId={route.labId} onLogout={handleLogout} />;
  }
  if (route.page === "detail") {
    return <LabDetail user={user} labId={route.labId} onLogout={handleLogout} />;
  }
  if (user.role === "instructor" && route.page === "overview") {
    window.history.replaceState({}, "", "/instructor");
    return <InstructorOverview user={user} onLogout={handleLogout} />;
  }
  return <Overview user={user} onLogout={handleLogout} />;
}
