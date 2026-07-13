import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { MonitorSmartphone } from "lucide-react";
import type { User, Route } from "./types";
import { getMe, logout, setSessionExpiredHandler } from "./api";
import ErrorBoundary from "./components/ErrorBoundary";
import LoadingScreen from "./components/LoadingScreen";
import SkipLink from "./components/SkipLink";
import ToastContainer from "./components/Toast";
import NotFound from "./components/NotFound";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const SignupPage = lazy(() => import("./pages/SignupPage"));
const Overview = lazy(() => import("./pages/Overview"));
const LabDetail = lazy(() => import("./pages/LabDetail"));
const Feedback = lazy(() => import("./pages/Feedback"));
const PasswordChange = lazy(() => import("./pages/PasswordChange"));
const InstructorOverview = lazy(() => import("./pages/InstructorOverview"));
const InstructorLabDetail = lazy(() => import("./pages/InstructorLabDetail"));
const InstructorGroupDetail = lazy(() => import("./pages/InstructorGroupDetail"));
const InstructorGroupStudentDetail = lazy(() => import("./pages/InstructorGroupStudentDetail"));
const InstructorGroupSessionDetail = lazy(() => import("./pages/InstructorGroupSessionDetail"));
const InstructorStudents = lazy(() => import("./pages/InstructorStudents"));
const InstructorPending = lazy(() => import("./pages/InstructorPending"));
const InstructorAccountPassword = lazy(() => import("./pages/InstructorAccountPassword"));

function parseRoute(): Route {
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

  if (/^\/instructor\/students\/?$/.test(path)) return { page: "instructor-students" };
  if (/^\/instructor\/pending\/?$/.test(path)) return { page: "instructor-pending" };
  if (/^\/instructor\/account\/password\/?$/.test(path)) return { page: "instructor-account-password" };
  if (/^\/instructor\/login\/?$/.test(path)) return { page: "instructor-login" };
  if (/^\/instructor\/?$/.test(path)) return { page: "instructor" };
  if (/^\/signup\/?$/.test(path)) return { page: "signup" };

  const feedbackMatch = path.match(/^\/labs\/([^/]+)\/feedback\/?$/);
  if (feedbackMatch) return { page: "feedback", labId: feedbackMatch[1] };

  const detailMatch = path.match(/^\/labs\/([^/]+)\/?$/);
  if (detailMatch) return { page: "detail", labId: detailMatch[1] };

  if (path === "/" || path === "") return { page: "overview" };

  return { page: "not-found" };
}

function AppContent() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    function onPopState() { setRoute(parseRoute()); }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      const dest = route.page.startsWith("instructor") ? "/instructor/login" : "/";
      window.history.pushState({}, "", dest);
      setRoute(parseRoute());
    });
  }, [route.page]);

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    setRoute(parseRoute());
  }, []);

  const handleLogin = useCallback((loggedInUser: User) => {
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

  if (checking) return <LoadingScreen />;

  const suspenseFallback = <LoadingScreen />;

  if (route.page === "signup" && !user) {
    return (
      <ErrorBoundary>
        <Suspense fallback={suspenseFallback}>
          <SignupPage onSignup={handleLogin} onSwitchToLogin={() => navigate("/")} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (route.page === "instructor-login" && !user) {
    return (
      <ErrorBoundary>
        <Suspense fallback={suspenseFallback}>
          <LoginPage mode="instructor" onLogin={handleLogin} onSwitchToLogin={() => navigate("/")} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <Suspense fallback={suspenseFallback}>
          <LoginPage
            mode="student"
            onLogin={handleLogin}
            onSwitchToSignup={() => navigate("/signup")}
            onSwitchToInstructor={() => navigate("/instructor/login")}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (user.must_change_password) {
    return (
      <ErrorBoundary>
        <Suspense fallback={suspenseFallback}>
          <PasswordChange
            onChanged={() => setUser({ ...user, must_change_password: false })}
            onLogout={handleLogout}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  let page: React.ReactNode;

  switch (route.page) {
    case "instructor-group-session":
      page = <InstructorGroupSessionDetail user={user} groupId={route.groupId!} studentId={route.studentId!} labId={route.labId!} onLogout={handleLogout} />;
      break;
    case "instructor-group-student":
      page = <InstructorGroupStudentDetail user={user} groupId={route.groupId!} studentId={route.studentId!} onLogout={handleLogout} />;
      break;
    case "instructor-group-detail":
      page = <InstructorGroupDetail user={user} groupId={route.groupId!} onLogout={handleLogout} />;
      break;
    case "instructor-students":
      page = <InstructorStudents user={user} onLogout={handleLogout} />;
      break;
    case "instructor-pending":
      page = <InstructorPending user={user} onLogout={handleLogout} />;
      break;
    case "instructor":
      page = <InstructorOverview user={user} onLogout={handleLogout} />;
      break;
    case "instructor-lab":
      page = <InstructorLabDetail user={user} labId={route.labId!} onLogout={handleLogout} />;
      break;
    case "instructor-session":
      page = <InstructorGroupSessionDetail user={user} groupId={0} studentId={route.studentId!} labId={route.labId!} onLogout={handleLogout} />;
      break;
    case "instructor-account-password":
      page = (
        <InstructorAccountPassword
          onChanged={() => navigate("/instructor")}
          onLogout={handleLogout}
        />
      );
      break;
    case "feedback":
      page = <Feedback user={user} labId={route.labId!} onLogout={handleLogout} />;
      break;
    case "detail":
      page = <LabDetail user={user} labId={route.labId!} onLogout={handleLogout} />;
      break;
    case "overview":
      if (user.role === "instructor") {
        window.history.replaceState({}, "", "/instructor");
        page = <InstructorOverview user={user} onLogout={handleLogout} />;
      } else {
        page = <Overview user={user} onLogout={handleLogout} />;
      }
      break;
    case "not-found":
      page = <NotFound />;
      break;
    default:
      page = <Overview user={user} onLogout={handleLogout} />;
  }

  return (
    <ErrorBoundary>
      <SkipLink />
      <Suspense fallback={suspenseFallback}>
        <main id="main-content">
          {page}
        </main>
      </Suspense>
      <ToastContainer />
    </ErrorBoundary>
  );
}

// The portal is built for instructor/student desk workflows (terminals, data tables,
// multi-column layouts) that don't have a meaningful mobile equivalent. Below `lg`,
// show a static notice instead of a half-broken responsive layout.
export default function App() {
  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background p-8 text-center lg:hidden">
        <MonitorSmartphone className="size-8 text-muted-foreground" />
        <div>
          <p className="text-lg font-semibold text-foreground">Best viewed on a laptop or desktop</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The Thesis Lab Portal is designed for larger screens. Please switch to a laptop or desktop to continue.
          </p>
        </div>
      </div>
      <div className="hidden lg:block">
        <AppContent />
      </div>
    </>
  );
}
