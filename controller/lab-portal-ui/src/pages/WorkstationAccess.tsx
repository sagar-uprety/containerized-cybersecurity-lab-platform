import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { User, WorkstationAccess as WorkstationAccessData } from "../types";
import { getWorkstationAccess } from "../api";
import StudentLayout from "../components/StudentLayout";
import PageHeader from "../components/PageHeader";
import AlertError from "../components/AlertError";
import CopyButton from "../components/CopyButton";
import DataChip from "../components/DataChip";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function WorkstationAccess({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [access, setAccess] = useState<WorkstationAccessData | null>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle("Workstation Access");

  useEffect(() => {
    getWorkstationAccess()
      .then(setAccess)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader
        title="Workstation access"
        description="Your private credential for workstation SSH and lab-local administrative SSH."
      />

      <AlertError message={error} className="mb-6" />

      {!access && !error && <Skeleton className="h-64 max-w-2xl" />}

      {access && (
        <Card className="max-w-2xl">
          <CardContent className="space-y-6">
            <div>
              <div className="mb-1 text-sm font-medium text-foreground">Infrastructure username</div>
              <DataChip>{access.student_id}</DataChip>
            </div>

            <div>
              <div className="mb-1 text-sm font-medium text-foreground">Workstation password</div>
              <div className="flex items-center rounded-md border border-border bg-muted px-3 py-2">
                <code className="min-w-0 flex-1 break-all font-mono text-sm text-foreground">
                  {visible ? access.workstation_password : "*".repeat(Math.min(access.workstation_password.length, 20))}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={visible ? "Hide workstation password" : "Show workstation password"}
                  title={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible((current) => !current)}
                >
                  {visible ? <EyeOff /> : <Eye />}
                </Button>
                <CopyButton value={access.workstation_password} label="Copy workstation password" />
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Use this password when connecting directly to your assigned workstation through an SSH fallback endpoint.
              </p>
              <p>
                Some lab guides also tell you to SSH from the browser workstation into a service container using your
                workstation or lab password. Use this same password there.
              </p>
              <p className="font-medium text-foreground">This is separate from your portal login password. Do not share it.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </StudentLayout>
  );
}
