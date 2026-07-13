import { useState, useEffect } from "react";
import type { User, SessionDetail, CheckResultData, Command } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import CheckResult from "../components/CheckResult";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import { fmtTimestamp } from "../utils/time";
import { outcomeStyle } from "../utils/outcome";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { getInstructorSessionDetail } from "../api";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface InstructorGroupSessionDetailProps {
  user: User;
  groupId: number;
  studentId: string;
  labId: string;
  onLogout: () => void;
}

interface ParsedSession {
  started_at: string;
  ended_at: string | null;
  outcome: string;
}

export default function InstructorGroupSessionDetail({ user, groupId, studentId, labId, onLogout }: InstructorGroupSessionDetailProps) {
  const [data, setData] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = new URLSearchParams(window.location.search);
  const sessionNum = params.get("session");

  useDocumentTitle(
    sessionNum
      ? `Session #${sessionNum} — ${labId}`
      : `${labId} — ${studentId}`
  );

  useEffect(() => {
    getInstructorSessionDetail(labId, studentId)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [labId, studentId]);

  const breadcrumbs = groupId
    ? [
        { label: "Dashboard", href: "/instructor" },
        { label: `Group`, href: `/instructor/groups/${groupId}` },
        { label: studentId, href: `/instructor/groups/${groupId}/students/${studentId}` },
        { label: sessionNum ? `Session #${sessionNum}` : labId },
      ]
    : [
        { label: "Dashboard", href: "/instructor" },
        { label: sessionNum ? `Session #${sessionNum}` : labId },
      ];

  if (error && !data) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <PageHeader title="Session" breadcrumbs={breadcrumbs} />
        <AlertError message={error} />
      </InstructorLayout>
    );
  }

  if (!data) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <Skeleton className="mb-4 h-7 w-48" />
        <Skeleton className="h-96 w-full" />
      </InstructorLayout>
    );
  }

  const { status, duration_seconds, commands, latest_check, scenario, lifecycle_events, check_results } = data;

  let sessionCommands: Command[] = commands || [];
  let sessionCheck: CheckResultData | null | undefined = latest_check;
  let sessionStatus: string = status;
  let sessionDuration: number | undefined = duration_seconds;

  if (sessionNum && lifecycle_events) {
    const endActions = new Set(["end", "stop", "destroy", "auto_stop"]);
    const sessions: ParsedSession[] = [];
    let current: ParsedSession | null = null;
    for (const ev of lifecycle_events) {
      if (ev.action === "start") {
        if (current?.ended_at) sessions.push(current);
        current = { started_at: ev.timestamp, ended_at: null, outcome: "running" };
      } else if (endActions.has(ev.action)) {
        if (current && !current.ended_at) {
          current.ended_at = ev.timestamp;
          current.outcome = ev.action;
          sessions.push(current);
          current = null;
        }
      }
    }
    if (current) sessions.push(current);
    sessions.reverse();

    const idx = parseInt(sessionNum, 10) - 1;
    const targetSession = sessions[idx];
    if (targetSession) {
      const sStart = new Date(targetSession.started_at);
      const sEnd = targetSession.ended_at ? new Date(targetSession.ended_at) : new Date();

      sessionCommands = (commands || []).filter((cmd) => {
        const t = new Date(cmd.timestamp);
        return t >= sStart && t <= sEnd;
      });

      const allChecks = check_results || [];
      const sessionChecks = allChecks.filter((cr) => {
        const t = new Date(cr.timestamp || cr.checked_at || "");
        return t >= sStart && t <= sEnd;
      });
      sessionCheck = sessionChecks.length > 0
        ? sessionChecks[sessionChecks.length - 1].check_result || sessionChecks[sessionChecks.length - 1] as unknown as CheckResultData
        : null;

      sessionStatus = targetSession.outcome;
      if (targetSession.ended_at) {
        sessionDuration = (sEnd.getTime() - sStart.getTime()) / 1000;
      }
    }
  }

  const statusStyle = outcomeStyle(sessionStatus);

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <PageHeader
        title={scenario?.title || labId}
        description={studentId + (sessionNum ? ` · Session #${sessionNum}` : "")}
        breadcrumbs={breadcrumbs}
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <Card className="flex-row items-center gap-2 px-3 py-2">
          <span className="text-xs text-muted-foreground">Status</span>
          <Badge className={statusStyle.badgeClass}>{statusStyle.label}</Badge>
        </Card>
        {sessionDuration != null && (
          <Card className="flex-row items-center gap-2 px-3 py-2">
            <span className="text-xs text-muted-foreground">Duration</span>
            <span className="text-sm font-medium text-foreground">{Math.round(sessionDuration / 60)} min</span>
          </Card>
        )}
      </div>

      {sessionCheck && (
        <div className="mb-6">
          <CheckResult result={sessionCheck} visible={true} checkerChecks={scenario?.checker?.checks} />
        </div>
      )}

      <Card className="mb-6">
        <CardContent>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Commands</h2>
            {sessionCommands.length > 0 && (
              <span className="text-xs text-muted-foreground">{sessionCommands.length} recorded</span>
            )}
          </div>
          {sessionCommands.length > 0 ? (
            <ScrollArea className="h-96">
              <div className="space-y-1 pr-3">
                {sessionCommands.map((cmd, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40">
                    <span className="w-32 shrink-0 text-xs text-muted-foreground">{fmtTimestamp(cmd.timestamp)}</span>
                    <code className="whitespace-pre-wrap break-all font-mono text-[0.8125rem] text-foreground">
                      {cmd.command?.trim() ? cmd.command : "(Enter)"}
                    </code>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">No commands recorded{sessionNum ? " for this session" : ""}.</p>
          )}
        </CardContent>
      </Card>

      {!sessionNum && lifecycle_events && lifecycle_events.length > 0 && (
        <Card>
          <CardContent>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Lifecycle events</h2>
            <div className="space-y-1">
              {lifecycle_events.map((event, i) => (
                <div key={i} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent/40">
                  <span className="w-40 shrink-0 text-xs text-muted-foreground">{fmtTimestamp(event.timestamp)}</span>
                  <span className="text-foreground">{event.action}</span>
                  {event.result && (
                    <span className={cn("ml-auto text-xs font-medium", event.result === "success" ? "text-success" : "text-destructive")}>
                      {event.result}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </InstructorLayout>
  );
}
