import { useState, useEffect, useRef, useCallback } from "react";
import type { User, LabDetail as LabDetailData, CheckResultData } from "../types";
import Header from "../components/Header";
import StatusBadge from "../components/StatusBadge";
import CheckResult from "../components/CheckResult";
import AlertError from "../components/AlertError";
import Breadcrumbs from "../components/Breadcrumbs";
import Link from "../components/Link";
import { getLabDetail, startLab, stopLab, resetLab, endLab, runCheck, sendHeartbeat } from "../api";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";

type LabAction = "start" | "stop" | "reset" | "end" | "check";

const ACTION_FNS: Record<string, (labId: string, csrf: string) => Promise<unknown>> = {
  start: startLab,
  stop: stopLab,
  reset: resetLab,
  end: endLab,
};

interface LabDetailProps {
  user: User;
  labId: string;
  onLogout: () => void;
}

export default function LabDetail({ user, labId, onLogout }: LabDetailProps) {
  const [data, setData] = useState<LabDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<LabAction | null>(null);
  const [checkResult, setCheckResult] = useState<CheckResultData | null>(null);
  const [hasChecked, setHasChecked] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  useDocumentTitle(data?.scenario?.title ?? "Lab");

  const fetchDetail = useCallback(() => {
    getLabDetail(labId)
      .then((d: LabDetailData) => {
        setData(d);
      })
      .catch((err: Error) => setError(err.message));
  }, [labId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!data || data.status !== "running") return;
    const interval = setInterval(() => {
      sendHeartbeat(labId).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [data?.status, labId]);

  // Split pane drag
  useEffect(() => {
    const shell = shellRef.current;
    const handle = handleRef.current;
    if (!shell || !handle) return;

    const stored = localStorage.getItem("lab-left-pane");
    if (stored) shell.style.setProperty("--left-pane", stored);

    let dragging = false;
    let overlay: HTMLDivElement | null = null;

    function setPane(clientX: number) {
      const rect = shell!.getBoundingClientRect();
      const pct = Math.min(68, Math.max(32, ((clientX - rect.left) / rect.width) * 100));
      const val = `${pct.toFixed(1)}%`;
      shell!.style.setProperty("--left-pane", val);
      localStorage.setItem("lab-left-pane", val);
    }

    function createOverlay() {
      if (overlay) return;
      overlay = document.createElement("div");
      overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;cursor:col-resize;";
      document.body.appendChild(overlay);
    }
    function removeOverlay() {
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
    }

    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      dragging = true;
      handle!.classList.add("active");
      createOverlay();
      setPane(e.clientX);
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      e.preventDefault();
      setPane(e.clientX);
    }
    function onPointerUp() {
      if (!dragging) return;
      dragging = false;
      handle!.classList.remove("active");
      removeOverlay();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const current = parseFloat(getComputedStyle(shell!).getPropertyValue("--left-pane")) || 48;
      const next = e.key === "ArrowLeft" ? current - 3 : current + 3;
      const val = `${Math.min(68, Math.max(32, next)).toFixed(1)}%`;
      shell!.style.setProperty("--left-pane", val);
      localStorage.setItem("lab-left-pane", val);
    }

    handle.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("keydown", onKeyDown);
    return () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("keydown", onKeyDown);
      removeOverlay();
    };
  }, [data?.status]);

  async function doAction(verb: LabAction) {
    setActionLoading(verb);
    try {
      const fn = ACTION_FNS[verb];
      await fn(labId, data!.csrf_token);
      if (verb === "end") {
        navigate(`/labs/${labId}/feedback`);
        return;
      }
      fetchDetail();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function doCheck() {
    setActionLoading("check");
    try {
      const result: CheckResultData = await runCheck(labId, data!.csrf_token);
      setCheckResult(result);
      setHasChecked(true);
    } catch (err: unknown) {
      setCheckResult({
        status: "error",
        checks: [{ name: err instanceof Error ? err.message : "Check failed", passed: false }],
      });
      setHasChecked(true);
    } finally {
      setActionLoading(null);
    }
  }

  function goFullscreen() {
    const container = document.getElementById("terminal-container");
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  if (error && !data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <Breadcrumbs items={[{ label: "Labs", href: "/" }, { label: "Error" }]} />
          <AlertError message={error} />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <div className="skeleton" style={{ height: 28, width: 200, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 400 }} />
        </div>
      </>
    );
  }

  const { scenario, status, endpoints, deadline } = data;
  const isRunning = status === "running";
  const canStart = status === "not_created" || status === "stopped" || status === "error";

  const deadlineDate = deadline ? new Date(deadline) : null;
  const hoursLeft = deadlineDate ? (deadlineDate.getTime() - Date.now()) / 3600000 : null;
  const deadlineUrgent = hoursLeft !== null && hoursLeft < 24 && hoursLeft > 0;

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <Breadcrumbs items={[{ label: "Labs", href: "/" }, { label: scenario.title }]} />

        <div className="lab-shell" id="lab-shell" ref={shellRef}>
          <section className="lab-content">
            <h1>{scenario.title}</h1>

            <div className="status-row">
              <span className="status-label">State</span>
              <StatusBadge status={status} />
            </div>

            {deadlineDate && (
              <div
                className="duration-warning"
                style={deadlineUrgent ? {
                  color: "var(--red)",
                  background: "var(--red-bg)",
                  borderColor: "var(--red-border)",
                } : {}}
              >
                Deadline: {deadlineDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {deadlineDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                {hoursLeft !== null && hoursLeft < 48 && (
                  <span style={{ marginLeft: "var(--sp-2)", fontWeight: 700 }}>
                    ({hoursLeft < 1 ? "< 1 hour left" : `${Math.ceil(hoursLeft)} hours left`})
                  </span>
                )}
              </div>
            )}

            <AlertError message={error} />

            <div className="toolbar">
              {canStart && (
                <button
                  className="btn btn-primary btn-block-mobile"
                  onClick={() => doAction("start")}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "start" ? "Starting..." : "Start Lab"}
                </button>
              )}
              {isRunning && (
                <>
                  <button
                    className="btn btn-amber btn-block-mobile"
                    onClick={doCheck}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === "check" ? "Checking..." : "Run Check"}
                  </button>
                  <button
                    className="btn btn-block-mobile"
                    onClick={() => doAction("stop")}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === "stop" ? "Stopping..." : "Stop"}
                  </button>
                  <button
                    className="btn btn-block-mobile"
                    onClick={() => doAction("reset")}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === "reset" ? "Resetting..." : "Reset"}
                  </button>
                </>
              )}
              {status !== "not_created" && (
                <button
                  className="btn btn-danger btn-block-mobile"
                  onClick={() => doAction("end")}
                  disabled={!!actionLoading}
                >
                  {actionLoading === "end" ? "Ending..." : "End Lab"}
                </button>
              )}
            </div>

            <CheckResult result={checkResult} visible={hasChecked} checkerChecks={scenario.checker?.checks} />

            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Situation</span>
              </div>
              <p><strong>Role:</strong> {scenario.story?.role}</p>
              <p>{scenario.story?.situation}</p>
              <div className="duration-warning">
                This lab will auto-stop if idle for {scenario.lifecycle?.idle_timeout_minutes} min or if running for more than {scenario.lifecycle?.max_runtime_minutes} min.
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Lab Guide</span>
              </div>
              <p className="text-sm-muted">
                Follow the MkDocs guide for orientation, investigation, remediation, and verification.
              </p>
              <a
                href={endpoints?.guide_url || `/docs/labs/${labId}/`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-sm guide-link"
                style={{ marginTop: "var(--sp-2)" }}
              >
                Open Lab Guide
              </a>
            </div>

            {isRunning && endpoints && (
              <div className="panel">
                <div className="panel-header">
                  <span className="panel-title">Access</span>
                </div>
                <div className="access-row">
                  <span className="access-label">Terminal</span>
                  <a href={endpoints.browser_terminal} target="_blank" rel="noreferrer">
                    Open in tab
                  </a>
                </div>
                <div className="access-row">
                  <span className="access-label">SSH fallback</span>
                  <code>{endpoints.ssh}</code>
                </div>
                {endpoints.app && (
                  <div className="access-row">
                    <span className="access-label">Application</span>
                    <a href={endpoints.app} target="_blank" rel="noreferrer">
                      {endpoints.app}
                    </a>
                  </div>
                )}
              </div>
            )}
          </section>

          {isRunning && endpoints ? (
            <>
              <div className="split-handle" id="split-handle" ref={handleRef} role="separator" tabIndex={0} aria-label="Resize terminal pane" />
              <aside className="lab-terminal" id="terminal-container">
                <div className="terminal-header">
                  <span className="terminal-title">{user.student_id || user.username}</span>
                  <button className="btn btn-ghost btn-sm" onClick={goFullscreen}>Fullscreen</button>
                </div>
                <iframe
                  className="terminal-frame"
                  id="terminal-iframe"
                  title="Student browser terminal"
                  src={endpoints.browser_terminal}
                />
              </aside>
            </>
          ) : (
            <>
              <div className="split-handle" style={{ visibility: "hidden" }} />
              <aside className="lab-terminal" style={{ visibility: "hidden" }} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
