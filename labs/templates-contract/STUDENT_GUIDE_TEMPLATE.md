# <Lab Title>

<2-3 sentence narrative setting the scene: the student's role, what has been observed, and what they need to do. Write naturally - do not name the specific defect and do not use bold labels. Let the situation unfold like a real work assignment.>

## Why This Matters

<Why a professional should care about this class of failure, with measured scale and a citation.>

## Objectives

By the end of this lab you should be able to:

-   <Lab-specific capability 1>
-   <Lab-specific capability 2>
-   <Lab-specific capability 3>
-   <Lab-specific capability 4>

## Prerequisites

Before starting this lab, you should be familiar with:

-   <Concept 1: a concrete topic the student needs in order to reason about the vulnerability>
-   <Concept 2: another relevant background topic>
-   <Concept 3: if applicable, a specific tool or protocol concept>

If you need to review these topics, see:

-   <Official resource 1: authoritative learning material>
-   <Official resource 2: official documentation overview or getting-started guide>
-   <Official resource 3: security concept reference if applicable>

## Your Lab Environment

<Describe the topology: which hosts exist, which networks connect them, and where the browser terminal starts.>

Paths and access you will need:

-   `<path>` - <what it holds and why the student needs it>
-   `<account>` - <which host it administers and how its password is obtained>

Use the portal to **Start Lab**, **Run Check**, **Reset**, or **End Lab** at any time. **Reset** restores the original vulnerable baseline, so it is not a way to reload a fix.

If the browser terminal is unavailable, use the SSH fallback endpoint shown on the portal's Workstation Access page.

## Your Mission

1. <Outcome 1: what to establish about the environment>
2. <Outcome 2: what to demonstrate>
3. <Outcome 3: what to put right, stated as an end state>
4. <Outcome 4: what must still work afterwards>
5. Run **Run Check** in the portal and record the result.
6. Complete the feedback form after ending the lab.

## Investigation

Before changing anything, understand the environment and confirm the problem is real.

**Guiding questions:**

-   <What should the student establish about the network or the service?>
-   <What behaviour would indicate that something is wrong?>
-   <What distinguishes a superficial finding from proof of real exposure?>

<Name the tool families available in THIS lab, then give generic-form command shapes.>

```bash
<generic-form diagnostic command with placeholders>
```

**Proving impact:** <What the student must demonstrate, stated as a claim to establish rather than a command to run. Require evidence beyond "the port is open".> Use only what the lab environment provides - do not introduce real credentials or external resources.

## Remediate

Now put it right.

**Goal:** <REVEAL TIER 5. State the observable end state, never the mechanism.>

**Constraints:** <What must keep working, and what must survive a service restart. Include dependent-service continuity only if scenario.yaml actually declares a dependent application service.>

**Where to work:** <Which host, which mounted path, which administrative account. This is scope (tier 3), so state it plainly - a student who cannot find the config cannot learn anything. Do not state what to change inside it.>

**References:**

-   Official documentation: <link to the vendor's own security or configuration page>
-   Local: `man <config-file>`, `<command> --help`

**If you're stuck:**

-   <Hint 1 - conceptual. Name the security principle at stake, no service specifics.>
-   <Hint 2 - directional. Point to the area of configuration or the class of control, still no directive names.>
-   <Hint 3 - documentation. Point at the section of the official docs that contains the answer.>

## Verify

After applying your fix, confirm:

1. <Condition 1>
2. <Condition 2>
3. <Condition 3>

Use the same tools from your investigation to re-check. When satisfied, click **Run Check** in the portal.

## Real-World Context

<Two or three paragraphs: what this misconfiguration looks like at Internet scale, with figures and citations; a notable real incident if one applies; and the operational check, monitoring rule, or review step that would catch it earlier in production.>

**Sources:**

-   <Author (Venue Year): full title, with link>
-   <Second source if applicable>

---

_When you're done, end the lab through the portal and complete the feedback form. Take a moment to reflect on what you learned - what surprised you, what you'd do differently, and how this applies beyond this specific scenario._
