import { BarChart, Bar, XAxis, YAxis, Cell } from "recharts";
import type { LabProgress } from "../types";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

interface Props {
  labs: LabProgress[];
  totalStudents: number;
}

const chartConfig = {
  pct: { label: "Pass rate" },
} satisfies ChartConfig;

function colorFor(pct: number): string {
  if (pct >= 80) return "var(--chart-2)";
  if (pct > 0) return "var(--chart-1)";
  return "var(--border)";
}

export default function LabPassRateChart({ labs, totalStudents }: Props) {
  const data = labs.map((l) => ({
    name: l.title,
    pct: totalStudents > 0 ? Math.round((l.students_passed / totalStudents) * 100) : 0,
    passed: l.students_passed,
  }));

  return (
    <ChartContainer
      config={chartConfig}
      className="aspect-auto w-full rounded-lg border border-border bg-card p-4"
      style={{ height: Math.max(120, data.length * 44) }}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="name" width={260} tickLine={false} axisLine={false} tick={{ width: 250 }} interval={0} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _name, item) => {
                const payload = item?.payload as { name?: string; passed?: number } | undefined;
                return (
                  <span>
                    <span className="font-medium text-foreground">{payload?.name}</span>: {String(value)}% ({payload?.passed ?? 0}/{totalStudents} passed)
                  </span>
                );
              }}
            />
          }
        />
        <Bar dataKey="pct" radius={4} barSize={18}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorFor(d.pct)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
