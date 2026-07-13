import { useState, useEffect } from "react";
import type { User, InstructorLabDetailData } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import { getInstructorLabDetail } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { FileText, BookOpen, GraduationCap, MessageSquare, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  user: User;
  labId: string;
  onLogout: () => void;
}

export default function InstructorLabDetail({ user, labId, onLogout }: Props) {
  const [data, setData] = useState<InstructorLabDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(data?.scenario.title || "Lab Detail");

  useEffect(() => {
    getInstructorLabDetail(labId)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [labId]);

  if (error && !data) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <PageHeader title="Lab" breadcrumbs={[{ label: "Dashboard", href: "/instructor" }, { label: "Lab" }]} />
        <AlertError message={error} />
      </InstructorLayout>
    );
  }

  if (!data) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <Skeleton className="mb-4 h-7 w-48" />
        <Skeleton className="h-48 w-full" />
      </InstructorLayout>
    );
  }

  const { scenario, feedback_count } = data;
  const docs = scenario.documentation || {};

  const docLinks = [
    { url: docs.student_guide_url, icon: BookOpen, title: "Lab guide", desc: "Student-facing guide with discovery steps and hints" },
    { url: docs.solution_guide_url, icon: FileText, title: "Solution guide", desc: "Full remediation steps (instructor only)" },
    { url: docs.instructor_guide_url, icon: GraduationCap, title: "Instructor guide", desc: "Teaching notes, common mistakes, hint policy" },
  ];

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <PageHeader
        title={scenario.title}
        breadcrumbs={[{ label: "Dashboard", href: "/instructor" }, { label: scenario.title }]}
        actions={scenario.difficulty ? <Badge variant="outline">{scenario.difficulty}</Badge> : undefined}
      />

      <div className="space-y-3">
        {docLinks.map(({ url, icon: Icon, title, desc }) => url && (
          <a
            key={title}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <div className="flex items-center gap-3">
              <Icon className="size-4.5 shrink-0 text-muted-foreground" />
              <div>
                <div className="font-medium text-foreground">{title}</div>
                <div className="text-sm text-muted-foreground">{desc}</div>
              </div>
            </div>
            <ExternalLink className="size-4 shrink-0 text-primary" />
          </a>
        ))}

        {feedback_count > 0 && (
          <a
            href={`/api/instructor/feedback/${labId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"
          >
            <div className="flex items-center gap-3">
              <MessageSquare className="size-4.5 shrink-0 text-muted-foreground" />
              <div>
                <div className="font-medium text-foreground">Student feedback</div>
                <div className="text-sm text-muted-foreground">{feedback_count} response{feedback_count !== 1 ? "s" : ""} submitted</div>
              </div>
            </div>
            <ExternalLink className="size-4 shrink-0 text-primary" />
          </a>
        )}
      </div>
    </InstructorLayout>
  );
}
