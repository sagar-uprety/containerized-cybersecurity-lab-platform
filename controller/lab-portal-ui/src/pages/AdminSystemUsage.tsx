import { useState, useEffect, useCallback } from "react";
import type { User, SystemStatus, DiskUsage } from "../types";
import AdminLayout from "../components/AdminLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import { getAdminSystemStatus } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Cpu, MemoryStick, FlaskConical, RefreshCw, HardDrive } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props {
  user: User;
  onLogout: () => void;
}

const REFRESH_INTERVAL_MS = 15000;

function usageTone(pct: number): "default" | "warning" | "danger" {
  if (pct >= 90) return "danger";
  if (pct >= 75) return "warning";
  return "default";
}

function UsageBar({ label, pct, detail }: { label: string; pct: number; detail?: string }) {
  const tone = usageTone(pct);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">{detail ?? `${pct}%`}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            tone === "danger" ? "bg-destructive" : tone === "warning" ? "bg-warning" : "bg-primary"
          )}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

function DiskGroup({
  title,
  caption,
  disks,
  missingNote,
}: {
  title: string;
  caption: string;
  disks?: DiskUsage[];
  missingNote: string;
}) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{caption}</div>
      </div>
      {!disks || disks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{missingNote}</p>
      ) : (
        <div className="space-y-4">
          {disks.map((disk) => (
            <UsageBar
              key={disk.path}
              // Every interesting path on these hosts currently sits on one
              // filesystem, so show which paths a bar actually covers rather
              // than implying each has its own capacity.
              label={disk.labels?.length ? `${disk.path} (${disk.labels.join(", ")})` : disk.path}
              pct={disk.percent}
              detail={`${disk.used_gb} GB / ${disk.total_gb} GB - ${disk.free_gb} GB free`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSystemUsage({ user, onLogout }: Props) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useDocumentTitle("System Usage");

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getAdminSystemStatus();
      setStatus(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reach worker x01");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  return (
    <AdminLayout user={user} onLogout={onLogout}>
      <PageHeader
        title="System Usage"
        description="Live CPU, memory, storage, and running-lab count across the lab worker (x01) and management host (x02)."
        actions={
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <AlertError message={error} className="mb-6" />

      {!status && !error && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      )}

      {status && (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={FlaskConical}
              label="Labs running"
              value={status.running_labs}
              description="Distinct student lab instances currently up"
            />
            <StatCard
              icon={Cpu}
              label="CPU usage"
              value={`${status.cpu_percent}%`}
              tone={usageTone(status.cpu_percent) === "danger" ? "danger" : "default"}
            />
            <StatCard
              icon={MemoryStick}
              label="Memory usage"
              value={`${status.memory_percent}%`}
              description={`${status.memory_used_mb.toLocaleString()} / ${status.memory_total_mb.toLocaleString()} MB`}
              tone={usageTone(status.memory_percent) === "danger" ? "danger" : "default"}
            />
          </div>

          <Card>
            <CardContent className="space-y-5">
              <UsageBar label="CPU" pct={status.cpu_percent} />
              <UsageBar
                label="Memory"
                pct={status.memory_percent}
                detail={`${status.memory_used_mb.toLocaleString()} MB / ${status.memory_total_mb.toLocaleString()} MB`}
              />
            </CardContent>
          </Card>

          <h2 className="mt-6 mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
            <HardDrive className="size-4 text-muted-foreground" /> Storage
          </h2>
          <Card>
            <CardContent className="space-y-5">
              <DiskGroup
                title="Lab worker (x01)"
                caption="Lab images and container layers grow here."
                disks={status.disks}
                missingNote="The worker has not reported storage yet."
              />
              <DiskGroup
                title="Management host (x02)"
                caption="Portal database, backups, and evidence exports."
                disks={status.portal_disks}
                missingNote="No storage reported for the portal host."
              />
            </CardContent>
          </Card>

          <p className="mt-3 text-xs text-muted-foreground">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ""} - refreshes automatically every{" "}
            {REFRESH_INTERVAL_MS / 1000}s.
          </p>
        </>
      )}
    </AdminLayout>
  );
}
