import { useState, useEffect } from "react";
import type { User, InstructorLabDetailData } from "../types";
import Header from "../components/Header";
import AlertError from "../components/AlertError";
import Breadcrumbs from "../components/Breadcrumbs";
import Link from "../components/Link";
import { getInstructorLabDetail } from "../api";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import { FileText, BookOpen, GraduationCap, MessageSquare, ExternalLink } from "lucide-react";

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
      <>
        <Header user={user} onLogout={onLogout} />
        <div className="container">
          <Breadcrumbs items={[
            { label: "Dashboard", href: "/instructor" },
            { label: "Lab" },
          ]} />
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
          <div className="skeleton" style={{ height: 200 }} />
        </div>
      </>
    );
  }

  const { scenario, feedback_count } = data;
  const docs = scenario.documentation || {};

  const docLinks = [
    { url: docs.student_guide_url, icon: BookOpen, title: "Lab Guide", desc: "Student-facing guide with discovery steps and hints" },
    { url: docs.solution_guide_url, icon: FileText, title: "Solution Guide", desc: "Full remediation steps (instructor only)" },
    { url: docs.instructor_guide_url, icon: GraduationCap, title: "Instructor Guide", desc: "Teaching notes, common mistakes, hint policy" },
  ];

  return (
    <>
      <Header user={user} onLogout={onLogout} />
      <div className="container">
        <Breadcrumbs items={[
          { label: "Dashboard", href: "/instructor" },
          { label: scenario.title },
        ]} />

        <h1>{scenario.title}</h1>
        {scenario.difficulty && (
          <div className="flex-center gap-sm mb-lg">
            <span className="badge">{scenario.difficulty}</span>
          </div>
        )}

        <div className="flex-col gap-md">
          {docLinks.map(({ url, icon: Icon, title, desc }) => url && (
            <a key={title} href={url} target="_blank" rel="noreferrer" className="panel doc-link-panel mb-0">
              <div className="flex-between gap-lg">
                <div className="flex-center gap-sm">
                  <Icon size={18} className="text-sm-muted" />
                  <div>
                    <div style={{ fontWeight: 600 }}>{title}</div>
                    <div className="text-sm-muted">{desc}</div>
                  </div>
                </div>
                <ExternalLink size={16} style={{ color: "var(--tum-blue)", flexShrink: 0 }} />
              </div>
            </a>
          ))}

          {feedback_count > 0 && (
            <a href={`/api/instructor/feedback/${labId}`} target="_blank" rel="noreferrer" className="panel doc-link-panel mb-0">
              <div className="flex-between gap-lg">
                <div className="flex-center gap-sm">
                  <MessageSquare size={18} className="text-sm-muted" />
                  <div>
                    <div style={{ fontWeight: 600 }}>Student Feedback</div>
                    <div className="text-sm-muted">{feedback_count} response{feedback_count !== 1 ? "s" : ""} submitted</div>
                  </div>
                </div>
                <ExternalLink size={16} style={{ color: "var(--tum-blue)", flexShrink: 0 }} />
              </div>
            </a>
          )}
        </div>
      </div>
    </>
  );
}
