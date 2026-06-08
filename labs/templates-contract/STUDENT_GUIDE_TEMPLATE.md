# <Lab Title>

<2-3 sentence narrative setting the scene: the student's role, what's been observed, and what they need to do. Write naturally — do not name the vulnerability or use bold labels. Let the situation unfold like a real work assignment.>

## Objectives

By the end of this lab you should be able to:

-   Identify and explain the security issue in your own words
-   Demonstrate the impact using only the lab environment
-   Apply an appropriate fix
-   Verify your fix using the portal checker

## Getting Started

Read the incident brief to understand your mission:

```bash
cat ~/SITREP.txt
```

Your lab environment includes the containers and networks described in the brief. Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** as needed.

## Investigation

Before fixing anything, understand the environment and confirm the problem is real.

**Guiding questions:**

-   <What should the student figure out about the network or services?>
-   <What behavior would indicate a vulnerability?>

Use standard Linux and service-administration tools to explore the environment. <Describe tool families available in this specific lab.>

**Proving impact:** Once you've identified the issue, demonstrate that it has real consequences. Use only what the lab environment provides — do not introduce real credentials or external resources.

## Remediate

Now fix the issue.

**Goal:** <what to achieve — stated as an outcome, not a command>

**Constraints:** Changes must survive a service restart.

**References:**

-   Official documentation: <link>
-   Local: `man <page>`, `<cli> --help`

**If you're stuck:**

-   <Conceptual: what security principle applies here?>
-   <Directional: what area of configuration controls this?>
-   <Specific: where in the documentation to look?>

## Verify

After applying your fix, confirm:

1.  The vulnerability is no longer exploitable
2.  The service is functioning correctly

When satisfied, click **Run Check** in the portal.

---

_When you're done, end the lab through the portal and complete the feedback form. Take a moment to reflect on what you learned — what surprised you, what you'd do differently, and how this applies beyond this specific scenario._

---

**Note:** This file lives at `labs/<lab-id>/docs/student-guide.md`. The MkDocs include at `docs/labs/<lab-id>.md` pulls it automatically via `--8<--` snippet. You do not need to edit the MkDocs file separately.
