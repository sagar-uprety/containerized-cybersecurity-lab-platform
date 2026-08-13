import { ShieldCheck } from "lucide-react";
import { useDocumentTitle } from "../utils/useDocumentTitle";
import Link from "../components/Link";
import { Card } from "@/components/ui/card";

interface PrivacyPolicyPageProps {
  /** Where the "Back" link should go — differs for a logged-in vs. logged-out visitor. */
  backHref?: string;
  backLabel?: string;
}

export default function PrivacyPolicyPage({ backHref = "/", backLabel = "← Back" }: PrivacyPolicyPageProps) {
  useDocumentTitle("Privacy Policy");

  return (
    <div className="min-h-screen bg-background p-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-4">
          <Link href={backHref} className="text-sm text-primary hover:underline">
            {backLabel}
          </Link>
        </div>

        <Card className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Privacy Policy</h1>
              <div className="text-sm text-muted-foreground">Thesis Lab Portal — Cybersecurity Lab Platform</div>
            </div>
          </div>

          <div className="space-y-6 text-sm leading-relaxed text-foreground">
            <p className="text-muted-foreground">
              This page explains what the Thesis Lab Portal records about your account and your lab
              activity, why, and who can see it. It is written in plain language rather than legal
              language; if you have questions, ask your instructor.
            </p>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Account information</h2>
              <p>
                When you sign up we store your university email, your chosen semester and study
                program, and a securely hashed copy of your portal password (we never store it in
                plain text). Your lab workstation credentials are also stored, since the platform uses
                them to provision your lab environment.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Lab session activity</h2>
              <p>
                Each time you start or stop a lab, we record the lab, the start and end time, how the
                session ended (e.g. you stopped it, or it timed out), and its overall pass/fail outcome
                from the automated checks. This is how the portal shows your progress and lets your
                instructor confirm a session happened.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Terminal command history</h2>
              <p>
                Inside a lab workstation, the commands you run in the terminal are logged as text —
                each command line, once you press Enter, along with when your session started and
                ended. This is used to help instructors troubleshoot a session and to support the
                automated checks, not to watch you work in real time.
              </p>
              <p>
                We deliberately do <strong>not</strong> capture screenshots, screen or video recordings,
                keystroke-level input, full terminal output, or browser activity. Only the command
                lines themselves are logged — nothing you type into a text editor, and nothing that
                appears on screen as output.
              </p>
              <p>
                Command history is troubleshooting and evaluation context only. It is never used to
                calculate a grade, rank or compare students, score "engagement," accuse anyone of
                academic dishonesty, or feed any automated risk-prediction system.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Automated checks and feedback</h2>
              <p>
                Each lab's automated checks record which criteria you passed or failed, so your results
                page can show accurate progress. After a lab, the short feedback form you submit
                (rating, comments) is stored linked to your student ID so instructors can follow up if
                needed. If this data is used in academic research or publication, it is anonymized
                first — your student ID is replaced with a pseudonym.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Who can see this</h2>
              <p>
                Your session activity, command history, check results, and feedback are visible to the
                instructors of your course, for grading, troubleshooting, and improving the lab
                material. This data is not shared outside the course teaching team.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Questions or requests</h2>
              <p>
                If you'd like to know more about what's stored about you, or want to request access to
                or deletion of your data, contact your course instructor directly.
              </p>
            </section>
          </div>
        </Card>
      </div>
    </div>
  );
}
