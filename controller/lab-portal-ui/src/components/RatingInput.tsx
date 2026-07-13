import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface RatingInputProps {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
}

export default function RatingInput({ value, onChange, max = 5, lowLabel = "Very unclear", highLabel = "Very clear" }: RatingInputProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground">{lowLabel}</span>
      <ToggleGroup
        type="single"
        variant="outline"
        value={value ? String(value) : ""}
        onValueChange={(v) => v && onChange(Number(v))}
      >
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <ToggleGroupItem key={n} value={String(n)} aria-label={`Rating ${n}`} className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="text-xs text-muted-foreground">{highLabel}</span>
    </div>
  );
}
