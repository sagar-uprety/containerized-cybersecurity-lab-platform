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

  useDocumentTitle("SSH Login Password");

  useEffect(() => {
    getWorkstationAccess()
      .then(setAccess)
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <StudentLayout user={user} onLogout={onLogout}>
      <PageHeader
        title="SSH Login Password"
      />

      <AlertError message={error} className="mb-6" />

      {!access && !error && <Skeleton className="h-64 max-w-2xl" />}

      {access && (
        <Card className="max-w-2xl">
          <CardContent className="space-y-6">
            <div>
              <div className="mb-1 text-sm font-medium text-foreground">SSH username</div>
              <DataChip>{access.student_id}</DataChip>
            </div>

            <div>
              <div className="mb-1 text-sm font-medium text-foreground">SSH password</div>
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
                Some lab guides will require you to SSH from inside the workstation into a target service container. Use
                this password there, unless the guide gives you a different one.
              </p>
              <p>
                You can also use this username and password to SSH into your workstation from a terminal on your own device if you prefer that way.
              </p>
              <p className="font-medium text-foreground">This is separate from your portal login password. Do not share it.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </StudentLayout>
  );
}
