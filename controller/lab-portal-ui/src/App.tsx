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
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));
const Overview = lazy(() => import("./pages/Overview"));
const LabDetail = lazy(() => import("./pages/LabDetail"));
const Feedback = lazy(() => import("./pages/Feedback"));
const StudentResults = lazy(() => import("./pages/StudentResults"));
const Enrollment = lazy(() => import("./pages/Enrollment"));
const StudentLabResults = lazy(() => import("./pages/StudentLabResults"));
const StudentAccountPassword = lazy(() => import("./pages/StudentAccountPassword"));
const WorkstationAccess = lazy(() => import("./pages/WorkstationAccess"));
const PasswordChange = lazy(() => import("./pages/PasswordChange"));
const InstructorOverview = lazy(() => import("./pages/InstructorOverview"));
const InstructorGroups = lazy(() => import("./pages/InstructorGroups"));
const InstructorLabDetail = lazy(() => import("./pages/InstructorLabDetail"));
const InstructorFeedback = lazy(() => import("./pages/InstructorFeedback"));
const InstructorLabCatalogue = lazy(() => import("./pages/InstructorLabCatalogue"));
const InstructorGroupDetail = lazy(() => import("./pages/InstructorGroupDetail"));
const InstructorGroupStudentDetail = lazy(() => import("./pages/InstructorGroupStudentDetail"));
const InstructorGroupSessionDetail = lazy(() => import("./pages/InstructorGroupSessionDetail"));
const InstructorStudents = lazy(() => import("./pages/InstructorStudents"));
const InstructorPending = lazy(() => import("./pages/InstructorPending"));
const InstructorResults = lazy(() => import("./pages/InstructorResults"));
const InstructorAnalytics = lazy(() => import("./pages/InstructorAnalytics"));
const InstructorAccountPassword = lazy(() => import("./pages/InstructorAccountPassword"));
const AdminInstructors = lazy(() => import("./pages/AdminInstructors"));
const AdminSystemUsage = lazy(() => import("./pages/AdminSystemUsage"));
const AdminAccountPassword = lazy(() => import("./pages/AdminAccountPassword"));

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

  const groupResultsMatch = path.match(/^\/instructor\/groups\/(\d+)\/results\/?$/);
  if (groupResultsMatch) return { page: "instructor-results", groupId: parseInt(groupResultsMatch[1], 10) };

  const groupAnalyticsMatch = path.match(/^\/instructor\/groups\/(\d+)\/analytics\/?$/);
  if (groupAnalyticsMatch) return { page: "instructor-analytics", groupId: parseInt(groupAnalyticsMatch[1], 10) };

  const instructorSessionMatch = path.match(/^\/instructor\/labs\/([^/]+)\/([^/]+)\/?$/);
  if (instructorSessionMatch) {
    return { page: "instructor-session", labId: instructorSessionMatch[1], studentId: instructorSessionMatch[2] };
  }

  const instructorLabFeedbackMatch = path.match(/^\/instructor\/labs\/([^/]+)\/feedback\/?$/);
  if (instructorLabFeedbackMatch) {
    return { page: "instructor-lab-feedback", labId: instructorLabFeedbackMatch[1] };
  }

  const instructorLabMatch = path.match(/^\/instructor\/labs\/([^/]+)\/?$/);
  if (instructorLabMatch) {
    return { page: "instructor-lab", labId: instructorLabMatch[1] };
  }

  if (/^\/instructor\/lab-catalogue\/?$/.test(path)) return { page: "instructor-lab-catalogue" };

  const instructorGroupSectionMatch = path.match(/^\/instructor\/groups\/(\d+)\/(labs|pending|activity)\/?$/);
  if (instructorGroupSectionMatch) {
    return { page: "instructor-group-detail", groupId: parseInt(instructorGroupSectionMatch[1], 10), section: instructorGroupSectionMatch[2] as "labs" | "pending" | "activity" };
  }

  const instructorGroupMatch = path.match(/^\/instructor\/groups\/(\d+)\/?$/);
  if (instructorGroupMatch) {
    return { page: "instructor-group-detail", groupId: parseInt(instructorGroupMatch[1], 10) };
  }

  if (/^\/instructor\/groups\/?$/.test(path)) return { page: "instructor-groups" };
  if (/^\/instructor\/students\/?$/.test(path)) return { page: "instructor-students" };
  if (/^\/instructor\/results\/?$/.test(path)) return { page: "instructor-results" };
  if (/^\/instructor\/analytics\/?$/.test(path)) return { page: "instructor-analytics" };
  if (/^\/instructor\/pending\/?$/.test(path)) return { page: "instructor-pending" };
  if (/^\/instructor\/account\/password\/?$/.test(path)) return { page: "instructor-account-password" };
  if (/^\/instructor\/login\/?$/.test(path)) return { page: "instructor-login" };
  if (/^\/instructor\/?$/.test(path)) return { page: "instructor" };
  if (/^\/admin\/account\/password\/?$/.test(path)) return { page: "admin-account-password" };
  if (/^\/admin\/system-usage\/?$/.test(path)) return { page: "admin-system-usage" };
  if (/^\/admin\/login\/?$/.test(path)) return { page: "admin-login" };
  if (/^\/admin\/?$/.test(path)) return { page: "admin" };
  if (/^\/signup\/?$/.test(path)) return { page: "signup" };
  if (/^\/privacy-policy\/?$/.test(path)) return { page: "privacy-policy" };

  const feedbackMatch = path.match(/^\/labs\/([^/]+)\/feedback\/?$/);
  if (feedbackMatch) return { page: "feedback", labId: feedbackMatch[1] };

  const detailMatch = path.match(/^\/labs\/([^/]+)\/?$/);
  if (detailMatch) return { page: "detail", labId: detailMatch[1] };

  const studentLabResultsMatch = path.match(/^\/results\/([^/]+)\/?$/);
  if (studentLabResultsMatch) return { page: "student-lab-results", labId: studentLabResultsMatch[1] };

  if (/^\/results\/?$/.test(path)) return { page: "results" };
  if (/^\/enrollment\/?$/.test(path)) return { page: "enrollment" };
  if (/^\/account\/password\/?$/.test(path)) return { page: "student-account-password" };
  if (/^\/workstation-access\/?$/.test(path)) return { page: "workstation-access" };

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
      const dest = route.page.startsWith("admin")
        ? "/admin/login"
        : route.page.startsWith("instructor")
        ? "/instructor/login"
        : "/";
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
    const dest =
      loggedInUser.role === "admin" ? "/admin" : loggedInUser.role === "instructor" ? "/instructor" : "/";
    window.history.pushState({}, "", dest);
    setRoute(parseRoute());
  }, []);

  const handleLogout = useCallback(async () => {
    const role = user?.role;
    try { await logout(); } catch {}
    setUser(null);
    const dest = role === "admin" ? "/admin/login" : role === "instructor" ? "/instructor/login" : "/";
    window.history.pushState({}, "", dest);
    setRoute(parseRoute());
  }, [user]);

  if (checking) return <LoadingScreen />;

  const suspenseFallback = <LoadingScreen />;

  if (route.page === "privacy-policy") {
    return (
      <ErrorBoundary>
        <Suspense fallback={suspenseFallback}>
          <PrivacyPolicyPage />
        </Suspense>
      </ErrorBoundary>
    );
  }

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

  if (route.page === "admin-login" && !user) {
    return (
      <ErrorBoundary>
        <Suspense fallback={suspenseFallback}>
          <LoginPage mode="admin" onLogin={handleLogin} onSwitchToLogin={() => navigate("/")} />
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
      page = <InstructorGroupDetail user={user} groupId={route.groupId!} section={route.section} onLogout={handleLogout} />;
      break;
    case "instructor-groups":
      page = <InstructorGroups user={user} onLogout={handleLogout} />;
      break;
    case "instructor-students":
      page = <InstructorStudents user={user} onLogout={handleLogout} />;
      break;
    case "instructor-results":
      page = <InstructorResults user={user} groupId={route.groupId} onLogout={handleLogout} />;
      break;
    case "instructor-analytics":
      page = <InstructorAnalytics user={user} groupId={route.groupId} onLogout={handleLogout} />;
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
    case "instructor-lab-feedback":
      page = <InstructorFeedback user={user} labId={route.labId!} onLogout={handleLogout} />;
      break;
    case "instructor-lab-catalogue":
      page = <InstructorLabCatalogue user={user} onLogout={handleLogout} />;
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
    case "admin":
      page = <AdminInstructors user={user} onLogout={handleLogout} />;
      break;
    case "admin-system-usage":
      page = <AdminSystemUsage user={user} onLogout={handleLogout} />;
      break;
    case "admin-account-password":
      page = (
        <AdminAccountPassword
          onChanged={() => navigate("/admin")}
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
    case "results":
      page = <StudentResults user={user} onLogout={handleLogout} />;
      break;
    case "enrollment":
      page = <Enrollment user={user} onLogout={handleLogout} />;
      break;
    case "student-lab-results":
      page = <StudentLabResults user={user} labId={route.labId!} onLogout={handleLogout} />;
      break;
    case "student-account-password":
      page = (
        <StudentAccountPassword
          onChanged={() => navigate("/")}
          onLogout={handleLogout}
        />
      );
      break;
    case "workstation-access":
      page = <WorkstationAccess user={user} onLogout={handleLogout} />;
      break;
    case "overview":
      if (user.role === "admin") {
        window.history.replaceState({}, "", "/admin");
        page = <AdminInstructors user={user} onLogout={handleLogout} />;
      } else if (user.role === "instructor") {
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
