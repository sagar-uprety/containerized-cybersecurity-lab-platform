import { useState, useEffect } from "react";
import type { User, InstructorLabInfo } from "../types";
import InstructorLayout from "../components/InstructorLayout";
import AlertError from "../components/AlertError";
import PageHeader from "../components/PageHeader";
import Link from "../components/Link";
import { getInstructorLabs } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { BookOpen, FileText, GraduationCap, ChevronRight, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  user: User;
  onLogout: () => void;
}

export default function InstructorLabCatalogue({ user, onLogout }: Props) {
  const [labs, setLabs] = useState<InstructorLabInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentTitle("Lab Catalogue");

  useEffect(() => {
    getInstructorLabs()
      .then(setLabs)
      .catch((err: Error) => setError(err.message));
  }, []);

  const courseLabs = labs?.filter((l) => !l.is_sample) ?? [];
  const sampleLabs = labs?.filter((l) => l.is_sample) ?? [];

  return (
    <InstructorLayout user={user} onLogout={onLogout}>
      <PageHeader
        title="Lab Catalogue"
        description="Every lab scenario on the platform, with its student guide, solution notes, and instructor guide - browse without assigning anything."
        breadcrumbs={[{ label: "Dashboard", href: "/instructor" }, { label: "Lab Catalogue" }]}
      />

      <AlertError message={error} className="mb-6" />

      {!labs && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
        </div>
      )}

      {labs && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold text-foreground">Course labs</h2>
            {courseLabs.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No course labs available.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courseLabs.map((lab) => <LabCatalogueCard key={lab.id} lab={lab} />)}
              </div>
            )}
          </section>

          {sampleLabs.length > 0 && (
            <section>
              <h2 className="mb-1 text-lg font-semibold text-foreground">Sample labs</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Platform demo/template scenarios for onboarding and testing - not meant to be assigned to a real
                course group.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sampleLabs.map((lab) => <LabCatalogueCard key={lab.id} lab={lab} sample />)}
              </div>
            </section>
          )}
        </div>
      )}
    </InstructorLayout>
  );
}

function LabCatalogueCard({ lab, sample }: { lab: InstructorLabInfo; sample?: boolean }) {
  const docLinks = [
    { url: lab.student_guide_url, icon: BookOpen, title: "Student guide" },
    { url: lab.solution_notes_url, icon: FileText, title: "Solution notes" },
    { url: lab.instructor_guide_url, icon: GraduationCap, title: "Instructor guide" },
  ];

  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium text-foreground">{lab.title}</span>
          {sample && (
            <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
              <FlaskConical className="size-3" /> Sample
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {lab.difficulty && <Badge variant="outline">{lab.difficulty}</Badge>}
          {!sample && lab.total_students != null && (
            <Badge className="border-transparent bg-muted text-muted-foreground">
              {lab.active_sessions ?? 0} active / {lab.total_students} students
            </Badge>
          )}
        </div>
        <div className="mt-auto space-y-1.5">
          {docLinks.map(({ url, icon: Icon, title }) => url && (
            <a
              key={title}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <Icon className="size-3.5 shrink-0" /> {title}
            </a>
          ))}
          <Link href={`/instructor/labs/${lab.id}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            Full lab detail <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
