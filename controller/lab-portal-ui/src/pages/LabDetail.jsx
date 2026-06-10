import { useState, useEffect, useRef, useCallback } from "react";
import Header from "../components/Header.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import CheckResult from "../components/CheckResult.jsx";
import { getLabDetail, startLab, stopLab, resetLab, endLab, runCheck, sendHeartbeat } from "../api.js";

export default function LabDetail({ user, labId, onLogout }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [hasChecked, setHasChecked] = useState(false);
  const shellRef = useRef(null);
  const handleRef = useRef(null);

  const fetchDetail = useCallback(() => {
    getLabDetail(labId)
      .then((d) => {
        setData(d);
      })
      .catch((err) => setError(err.message));
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

    function setPane(clientX) {
      const rect = shell.getBoundingClientRect();
      const pct = Math.min(68, Math.max(32, ((clientX - rect.left) / rect.width) * 100));
      const val = `${pct.toFixed(1)}%`;
      shell.style.setProperty("--left-pane", val);
      localStorage.setItem("lab-left-pane", val);
    }

    function onPointerDown(e) {
      handle.setPointerCapture(e.pointerId);
      handle.classList.add("active");
      setPane(e.clientX);
    }
    function onPointerMove(e) {
      if (handle.hasPointerCapture(e.pointerId)) setPane(e.clientX);
    }
    function onPointerUp() {
      handle.classList.remove("active");
    }
    function onKeyDown(e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const current = parseFloat(getComputedStyle(shell).getPropertyValue("--left-pane")) || 48;
      const next = e.key === "ArrowLeft" ? current - 3 : current + 3;
      const val = `${Math.min(68, Math.max(32, next)).toFixed(1)}%`;
      shell.style.setProperty("--left-pane", val);
      localStorage.setItem("lab-left-pane", val);
    }

    handle.addEventListener("pointerdown", onPointerDown);
    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("keydown", onKeyDown);
    return () => {
      handle.removeEventListener("pointerdown", onPointerDown);
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function doAction(verb) {
    setActionLoading(verb);
    try {
      const fn = { start: startLab, stop: stopLab, reset: resetLab, end: endLab }[verb];
      await fn(labId, data.csrf_token);
      if (verb === "end") {
        window.location.href = `/labs/${labId}/feedback`;
        return;
      }
      fetchDetail();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function doCheck() {
    setActionLoading("check");
    try {
      const result = await runCheck(labId, data.csrf_token);
      setCheckResult(result);
      setHasChecked(true);
    } catch (err) {
      setCheckResult({ status: "error", checks: [{ name: err.message, passed: false }] });
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
          <a href="/" className="back-link">&larr; Back to overview</a>
          <div className="panel" style={{ borderColor: "var(--red-muted)", color: "var(--red)" }}>
            {error}
          </div>
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

  const { scenario, status, endpoints, csrf_token } = data;
  const isRunning = status === "running";
  const canStart = status === "not_created" || status === "stopped" || status === "error";

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <a href="/" className="back-link">&larr; Back to overview</a>

        <div className="lab-shell" id="lab-shell" ref={shellRef}>
          <section className="lab-content">
            <h1>{scenario.title}</h1>

            <div className="status-row">
              <span className="status-label">State</span>
              <StatusBadge status={status} />
            </div>

            {error && (
              <div className="panel" style={{ borderColor: "var(--red-muted)", color: "var(--red)", fontSize: "0.85rem" }}>
                {error}
              </div>
            )}

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

            <CheckResult result={checkResult} visible={hasChecked} />

            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Situation</span>
              </div>
              <p><strong>Role:</strong> {scenario.story?.role}</p>
              <p>{scenario.story?.situation}</p>
              <div className="duration-warning">
                Estimated time: {scenario.duration_minutes} min. Auto-stop after {scenario.lifecycle?.max_runtime_minutes} min.
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Lab Guide</span>
              </div>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                Follow the MkDocs guide for orientation, investigation, remediation, and verification.
              </p>
              <a
                href={endpoints?.guide_url || `/docs/labs/${labId}/`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-sm guide-link"
                style={{ marginTop: "0.5rem" }}
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
