import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, XAxis, YAxis } from "recharts";
import type { AnalyticsLab, AnalyticsPoint, SessionSummary } from "../types";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const completionConfig = {
  completed_assignments: { label: "Achieved", color: "var(--chart-2)" },
  eligible_assignments: { label: "Assignments due so far", color: "var(--chart-1)" },
} satisfies ChartConfig;

const activityConfig = {
  sessions: { label: "Session starts", color: "var(--chart-1)" },
  active_students: { label: "Active students", color: "var(--chart-2)" },
} satisfies ChartConfig;

const labConfig = {
  started_rate: { label: "Started", color: "var(--chart-1)" },
  check_submission_rate: { label: "Check submitted", color: "var(--chart-3)" },
  completion_rate: { label: "Achieved", color: "var(--chart-2)" },
} satisfies ChartConfig;

const bottleneckConfig = {
  criterion_failure_rate: { label: "Failure observations", color: "var(--destructive)" },
} satisfies ChartConfig;

function shortTitle(title: string) {
  return title.length > 24 ? `${title.slice(0, 22)}…` : title;
}

export function CompletionTrendChart({ data }: { data: AnalyticsPoint[] }) {
  return (
    <ChartContainer config={completionConfig} className="h-64 w-full">
      <ComposedChart accessibilityLayer data={data} margin={{ left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area type="monotone" dataKey="completed_assignments" stroke="var(--color-completed_assignments)" fill="var(--color-completed_assignments)" fillOpacity={0.12} strokeWidth={2.5} />
        <Line type="stepAfter" dataKey="eligible_assignments" stroke="var(--color-eligible_assignments)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
      </ComposedChart>
    </ChartContainer>
  );
}

function ActivityChart({ data, metric }: { data: AnalyticsPoint[]; metric: "sessions" | "active_students" }) {
  return (
    <ChartContainer config={activityConfig} className="h-64 w-full">
      <LineChart accessibilityLayer data={data} margin={{ left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={30} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line type="monotone" dataKey={metric} stroke={`var(--color-${metric})`} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ChartContainer>
  );
}

export function SessionTrendChart({ data }: { data: AnalyticsPoint[] }) {
  return <ActivityChart data={data} metric="sessions" />;
}

export function ActiveStudentsTrendChart({ data }: { data: AnalyticsPoint[] }) {
  return <ActivityChart data={data} metric="active_students" />;
}

export function LabComparisonChart({ data }: { data: AnalyticsLab[] }) {
  const chartData = data.map((lab) => ({ ...lab, short_title: shortTitle(lab.title) }));
  return (
    <ChartContainer config={labConfig} className="h-80 w-full">
      <BarChart accessibilityLayer data={chartData} margin={{ left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="short_title" tickLine={false} axisLine={false} tickMargin={10} interval={0} angle={-15} textAnchor="end" height={66} />
        <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} width={38} />
        <ChartTooltip content={<ChartTooltipContent labelKey="title" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="started_rate" fill="var(--color-started_rate)" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
        <Bar dataKey="check_submission_rate" fill="var(--color-check_submission_rate)" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
        <Bar dataKey="completion_rate" fill="var(--color-completion_rate)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

export function LabBottleneckChart({ data }: { data: AnalyticsLab[] }) {
  const chartData = data.filter((lab) => lab.criterion_failure_rate != null).map((lab) => ({ ...lab, short_title: shortTitle(lab.title) }));
  return (
    <ChartContainer config={bottleneckConfig} className="h-72 w-full">
      <BarChart accessibilityLayer data={chartData} margin={{ left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="short_title" tickLine={false} axisLine={false} tickMargin={10} interval={0} angle={-15} textAnchor="end" height={66} />
        <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} tickLine={false} axisLine={false} width={38} />
        <ChartTooltip content={<ChartTooltipContent labelKey="title" />} />
        <Bar dataKey="criterion_failure_rate" fill="var(--color-criterion_failure_rate)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

const sessionConfig = {
  duration_minutes: { label: "Recorded runtime", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function SessionDurationChart({ sessions }: { sessions: SessionSummary[] }) {
  const data = sessions.map((session, index) => ({
    session: `#${index + 1}`,
    duration_minutes: Math.max(1, Math.round((session.duration_seconds || 0) / 60)),
  }));
  return (
    <ChartContainer config={sessionConfig} className="h-52 w-full">
      <LineChart accessibilityLayer data={data} margin={{ left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="session" tickLine={false} axisLine={false} tickMargin={10} />
        <YAxis tickFormatter={(value) => `${value}m`} tickLine={false} axisLine={false} width={38} />
        <ChartTooltip content={<ChartTooltipContent formatter={(value) => <span className="font-mono font-medium">{String(value)} min</span>} />} />
        <Line type="monotone" dataKey="duration_minutes" stroke="var(--color-duration_minutes)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ChartContainer>
  );
}
