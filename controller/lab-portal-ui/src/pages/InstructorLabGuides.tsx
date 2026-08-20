import { useState, useEffect } from "react";
import type { User, InstructorLabDetailData } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import { getInstructorLabDetail } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { BookOpen, FileText, GraduationCap, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

interface Props {
  user: User;
  labId: string;
  onLogout: () => void;
}

// The three guides live on a separately-served MkDocs/Nginx site (not an SPA
// route), and that site sits behind its own auth. An <iframe> there would
// either be blocked by X-Frame-Options/CSP or prompt for credentials inside
// a tiny frame - a broken experience we can't verify without a live deploy.
// Prominent out-links are the honest choice.
const GUIDES: Array<{
  key: "student_guide_url" | "solution_notes_url" | "instructor_guide_url";
  icon: typeof BookOpen;
  title: string;
  description: string;
}> = [
  {
    key: "student_guide_url",
    icon: BookOpen,
    title: "Student guide",
    description: "What students see: the scenario story, step-by-step instructions and hints.",
  },
  {
    key: "solution_notes_url",
    icon: FileText,
    title: "Solution notes",
    description: "Full walkthrough of the intended solution, including commands and checker rationale.",
  },
  {
    key: "instructor_guide_url",
    icon: GraduationCap,
    title: "Instructor guide",
    description: "Delivery notes: common pitfalls, discussion points and grading guidance.",
  },
];

export default function InstructorLabGuides({ user, labId, onLogout }: Props) {
  const [detail, setDetail] = useState<InstructorLabDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle(detail ? `Guides - ${detail.scenario.title}` : "Lab Guides");

  useEffect(() => {
    setDetail(null);
    setError(null);
    getInstructorLabDetail(labId)
      .then(setDetail)
      .catch((err: Error) => setError(err.message));
  }, [labId]);

  const breadcrumbs = [
    { label: "Dashboard", href: "/instructor" },
    { label: "Lab Catalogue", href: "/instructor/lab-catalogue" },
    { label: detail?.scenario.title || labId, href: `/instructor/labs/${labId}` },
    { label: "Guides" },
  ];

  if (error && !detail) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <PageHeader title="Lab guides" breadcrumbs={breadcrumbs} />
        <AlertError message={error} />
      </InstructorLayout>
    );
  }

  if (!detail) {
    return (
      <InstructorLayout user={user} onLogout={onLogout}>
        <Skeleton className="mb-4 h-7 w-48" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </InstructorLayout>
    );
  }

  const docs = detail.scenario.documentation;

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <PageHeader
        title="Lab guides"
        description={detail.scenario.title}
        breadcrumbs={breadcrumbs}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {GUIDES.map(({ key, icon: Icon, title, description }) => {
          const url = docs?.[key];
          return (
            <Card key={key}>
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Icon className="size-4.5 shrink-0 text-primary" />
                  <span className="font-medium text-foreground">{title}</span>
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
                <div className="mt-auto pt-1">
                  {url ? (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={url} target="_blank" rel="noreferrer">
                        Open guide <ExternalLink className="size-3.5" />
                      </a>
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">Not available for this lab.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </InstructorLayout>
  );
}
