import { useState, useEffect, useRef, useCallback } from "react";
import { Maximize2 } from "lucide-react";
import type { User, LabDetail as LabDetailData, CheckResultData } from "../types";
import StudentLayout from "../components/StudentLayout";
import StatusBadge from "../components/StatusBadge";
import CheckResult from "../components/CheckResult";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import CopyButton from "../components/CopyButton";
import { getLabDetail, startLab, stopLab, resetLab, endLab, runCheck, sendHeartbeat } from "../api";
import { navigate } from "../utils/navigate";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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

  const labIdRef = useRef(labId);
  useEffect(() => { labIdRef.current = labId; }, [labId]);

  const fetchDetail = useCallback(() => {
    const requestedLabId = labId;
    getLabDetail(labId)
      .then((d: LabDetailData) => {
        if (requestedLabId === labIdRef.current) setData(d);
      })
      .catch((err: Error) => {
        if (requestedLabId === labIdRef.current) setError(err.message);
      });
  }, [labId]);

  useEffect(() => {
    setData(null);
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (!data || data.status !== "running" || data.group?.is_active === false) return;
    const interval = setInterval(() => {
      sendHeartbeat(labId).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, [data?.group?.is_active, data?.status, labId]);

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
      overlay.style.cssText = "position:fixed;inset:0;z-index:var(--z-drag-overlay);cursor:col-resize;";
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
      handle!.classList.add("bg-primary");
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
      handle!.classList.remove("bg-primary");
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
      <StudentLayout user={user} onLogout={onLogout}>
        <PageHeader title="Error" breadcrumbs={[{ label: "Labs", href: "/" }, { label: "Error" }]} />
        <AlertError message={error} />
      </StudentLayout>
    );
  }

  if (!data) {
    return (
      <StudentLayout user={user} onLogout={onLogout}>
        <Skeleton className="mb-4 h-7 w-48" />
        <Skeleton className="h-96 w-full" />
      </StudentLayout>
    );
  }

  const { scenario, status, endpoints, deadline, group } = data;
  const isRunning = status === "running";
  const groupInactive = group?.is_active === false;
  const canStart = !groupInactive && (status === "not_created" || status === "stopped" || status === "error" || status === "ended");

  const deadlineDate = deadline ? new Date(deadline) : null;
  const hoursLeft = deadlineDate ? (deadlineDate.getTime() - Date.now()) / 3600000 : null;
  const deadlineUrgent = hoursLeft !== null && hoursLeft < 24 && hoursLeft > 0;

  return (
    <StudentLayout user={user} onLogout={onLogout} fullWidth>
      <PageHeader title={scenario.title} breadcrumbs={[{ label: "Labs", href: "/" }, { label: scenario.title }]} />

      <div
        id="lab-shell"
        ref={shellRef}
        className="grid overflow-hidden rounded-lg border border-border bg-card [grid-template-columns:minmax(340px,var(--left-pane,48%))_8px_minmax(400px,1fr)]"
        style={{ height: "calc(100vh - 8.5rem)" }}
      >
        <section className="overflow-y-auto p-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">State</span>
            <StatusBadge status={status} />
          </div>

          {groupInactive && (
            <div className="mb-3 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              This group is inactive. You can review this lab and stop or end an existing runtime, but cannot start, reset, or run checks.
            </div>
          )}

          {deadlineDate && (
            <div
              className={cn(
                "mb-3 rounded-md border px-3 py-2 text-sm",
                deadlineUrgent ? "border-destructive/30 bg-destructive-bg text-destructive" : "border-border bg-muted text-muted-foreground"
              )}
            >
              Deadline: {deadlineDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at {deadlineDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              {hoursLeft !== null && hoursLeft < 48 && (
                <span className="ml-2 font-semibold">
                  ({hoursLeft < 1 ? "< 1 hour left" : `${Math.ceil(hoursLeft)} hours left`})
                </span>
              )}
            </div>
          )}

          <AlertError message={error} className="mb-3" />

          <div className="mb-4 flex flex-wrap gap-2">
            {canStart && (
              <Button onClick={() => doAction("start")} disabled={!!actionLoading}>
                {actionLoading === "start" ? "Starting…" : "Start lab"}
              </Button>
            )}
            {isRunning && (
              <>
                {!groupInactive && (
                  <Button
                    variant="outline"
                    className="border-warning/30 text-warning hover:bg-warning-bg"
                    onClick={doCheck}
                    disabled={!!actionLoading}
                  >
                    {actionLoading === "check" ? "Checking…" : "Run check"}
                  </Button>
                )}
                <Button variant="outline" onClick={() => doAction("stop")} disabled={!!actionLoading}>
                  {actionLoading === "stop" ? "Stopping…" : "Stop"}
                </Button>
                {!groupInactive && (
                  <Button variant="outline" onClick={() => doAction("reset")} disabled={!!actionLoading}>
                    {actionLoading === "reset" ? "Resetting…" : "Reset"}
                  </Button>
                )}
              </>
            )}
            {status !== "not_created" && status !== "ended" && (
              <Button
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive-bg"
                onClick={() => doAction("end")}
                disabled={!!actionLoading}
              >
                {actionLoading === "end" ? "Ending…" : "End lab"}
              </Button>
            )}
          </div>

          {hasChecked && <div className="mb-4"><CheckResult result={checkResult} visible={hasChecked} checkerChecks={scenario.checker?.checks} /></div>}

          <Card className="mb-4">
            <CardContent className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Situation</h2>
              <p className="text-sm text-muted-foreground"><strong className="text-foreground">Role:</strong> {scenario.story?.role}</p>
              <p className="text-sm text-muted-foreground">{scenario.story?.situation}</p>
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                This lab will auto-stop if idle for {scenario.lifecycle?.idle_timeout_minutes} min or if running for more than {scenario.lifecycle?.max_runtime_minutes} min.
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardContent className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Lab guide</h2>
              <p className="text-sm text-muted-foreground">
                Follow the MkDocs guide for orientation, investigation, remediation, and verification.
              </p>
              <Button asChild size="sm">
                <a href={endpoints?.guide_url || `/docs/labs/${labId}/`} target="_blank" rel="noreferrer">
                  Open lab guide
                </a>
              </Button>
            </CardContent>
          </Card>

          {isRunning && endpoints && (
            <Card>
              <CardContent className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Access</h2>
                <p className="text-xs text-muted-foreground">SSH uses your workstation password, which is separate from your portal password.</p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Terminal</span>
                  <a href={endpoints.browser_terminal} target="_blank" rel="noreferrer" className="text-primary hover:underline">Open in tab</a>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">SSH fallback</span>
                  <div className="flex items-center gap-1">
                    <code className="rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs">{endpoints.ssh}</code>
                    <CopyButton value={endpoints.ssh} label="Copy SSH command" />
                  </div>
                </div>
                {endpoints.app && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Application</span>
                    <a href={endpoints.app} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{endpoints.app}</a>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {isRunning && endpoints ? (
          <>
            <div
              id="split-handle"
              ref={handleRef}
              role="separator"
              tabIndex={0}
              aria-label="Resize terminal pane"
              className="z-10 h-full w-full cursor-col-resize touch-none select-none bg-border transition-colors hover:bg-primary"
            />
            <aside id="terminal-container" className="flex min-w-0 flex-col bg-[#010409]">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-black/20 bg-primary px-3">
                <span className="font-mono text-xs font-semibold text-white/80">{user.student_id || user.username}</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-white/80 hover:bg-white/10 hover:text-white" onClick={goFullscreen}>
                  <Maximize2 className="size-3" /> Fullscreen
                </Button>
              </div>
              <iframe
                className="w-full flex-1 border-0 bg-[#010409]"
                id="terminal-iframe"
                title="Student browser terminal"
                src={endpoints.browser_terminal}
              />
            </aside>
          </>
        ) : (
          <>
            <div className="invisible" />
            <aside className="invisible" />
          </>
        )}
      </div>
    </StudentLayout>
  );
}
