import { useState, useEffect, useCallback } from "react";
import LoginPage from "./pages/LoginPage.jsx";
import Overview from "./pages/Overview.jsx";
import LabDetail from "./pages/LabDetail.jsx";
import Feedback from "./pages/Feedback.jsx";
import InstructorOverview from "./pages/InstructorOverview.jsx";
import InstructorLabDetail from "./pages/InstructorLabDetail.jsx";
import InstructorSessionDetail from "./pages/InstructorSessionDetail.jsx";
import InstructorManage from "./pages/InstructorManage.jsx";
import StudentSearch from "./pages/StudentSearch.jsx";
import PasswordChange from "./pages/PasswordChange.jsx";
import { getMe, logout } from "./api.js";

function parseRoute() {
  const path = window.location.pathname;

  const instructorSessionMatch = path.match(/^\/instructor\/labs\/([^/]+)\/([^/]+)\/?$/);
  if (instructorSessionMatch) {
    return { page: "instructor-session", labId: instructorSessionMatch[1], studentId: instructorSessionMatch[2] };
  }

  const instructorLabMatch = path.match(/^\/instructor\/labs\/([^/]+)\/?$/);
  if (instructorLabMatch) {
    return { page: "instructor-lab", labId: instructorLabMatch[1] };
  }

  const instructorSearchMatch = path.match(/^\/instructor\/search\/?$/);
  if (instructorSearchMatch) return { page: "instructor-search" };

  const instructorManageMatch = path.match(/^\/instructor\/manage\/?$/);
  if (instructorManageMatch) return { page: "instructor-manage" };

  const instructorMatch = path.match(/^\/instructor\/?$/);
  if (instructorMatch) return { page: "instructor" };

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
    function onPopState() {
      setRoute(parseRoute());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const handleLogin = useCallback((loggedInUser) => {
    setUser(loggedInUser);
    window.history.pushState({}, "", "/");
    setRoute({ page: "overview" });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } catch {}
    setUser(null);
    window.history.pushState({}, "", "/");
    setRoute({ page: "overview" });
  }, []);

  if (checking) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#6B7280" }}>
        Loading...
      </div>
    );
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (user.must_change_password) {
    return (
      <PasswordChange
        onChanged={() => setUser({ ...user, must_change_password: false })}
        onLogout={handleLogout}
      />
    );
  }

  if (route.page === "instructor-manage") {
    return <InstructorManage user={user} onLogout={handleLogout} />;
  }
  if (route.page === "instructor") {
    return <InstructorOverview user={user} onLogout={handleLogout} />;
  }
  if (route.page === "instructor-lab") {
    return <InstructorLabDetail user={user} labId={route.labId} onLogout={handleLogout} />;
  }
  if (route.page === "instructor-session") {
    return <InstructorSessionDetail user={user} labId={route.labId} studentId={route.studentId} onLogout={handleLogout} />;
  }
  if (route.page === "instructor-search") {
    return <StudentSearch user={user} onLogout={handleLogout} />;
  }
  if (route.page === "feedback") {
    return <Feedback user={user} labId={route.labId} onLogout={handleLogout} />;
  }
  if (route.page === "detail") {
    return <LabDetail user={user} labId={route.labId} onLogout={handleLogout} />;
  }
  // Redirect instructors from root to instructor dashboard
  if (user.role === "instructor" && route.page === "overview") {
    window.history.replaceState({}, "", "/instructor");
    return <InstructorOverview user={user} onLogout={handleLogout} />;
  }
  return <Overview user={user} onLogout={handleLogout} />;
}
