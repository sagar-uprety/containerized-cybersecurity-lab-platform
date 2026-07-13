import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { LabProgress } from "../types";

interface Props {
  labs: LabProgress[];
  totalStudents: number;
}

function colorFor(pct: number): string {
  if (pct >= 80) return "#16A34A";
  if (pct >= 40) return "#D97706";
  if (pct > 0) return "#0065BD";
  return "#D1D5DB";
}

export default function LabPassRateChart({ labs, totalStudents }: Props) {
  const data = labs.map((l) => ({
    name: l.title.length > 22 ? l.title.slice(0, 20) + "…" : l.title,
    fullName: l.title,
    pct: totalStudents > 0 ? Math.round((l.students_passed / totalStudents) * 100) : 0,
    passed: l.students_passed,
  }));

  return (
    <div className="chart-card">
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 44)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fill: "var(--ink)" }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(value, _name, item) => {
              const passed = (item?.payload as { passed?: number } | undefined)?.passed ?? 0;
              return [`${value}% (${passed}/${totalStudents} passed)`, "Pass rate"];
            }}
            labelFormatter={(_label, payload) => {
              const first = payload?.[0]?.payload as { fullName?: string } | undefined;
              return first?.fullName || "";
            }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--border-light)" }}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={colorFor(d.pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
