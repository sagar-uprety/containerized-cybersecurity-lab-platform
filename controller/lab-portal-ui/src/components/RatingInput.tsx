interface RatingInputProps {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  lowLabel?: string;
  highLabel?: string;
}

export default function RatingInput({ value, onChange, max = 5, lowLabel = "Very unclear", highLabel = "Very clear" }: RatingInputProps) {
  return (
    <div className="rating-input">
      <span className="rating-label-end">{lowLabel}</span>
      <div className="rating-buttons">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`rating-btn ${value === n ? "rating-btn-active" : ""}`}
            onClick={() => onChange(n)}
            aria-label={`Rating ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="rating-label-end">{highLabel}</span>
    </div>
  );
}
