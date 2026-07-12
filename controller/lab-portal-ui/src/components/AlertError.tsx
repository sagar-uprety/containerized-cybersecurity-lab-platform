interface AlertErrorProps {
  message: string | null;
  className?: string;
}

export default function AlertError({ message, className = "" }: AlertErrorProps) {
  if (!message) return null;
  return (
    <div className={`alert-error ${className}`}>
      {message}
    </div>
  );
}
