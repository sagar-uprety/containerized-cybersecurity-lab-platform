import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface AlertErrorProps {
  message: string | null;
  className?: string;
}

export default function AlertError({ message, className = "" }: AlertErrorProps) {
  if (!message) return null;
  return (
    <Alert variant="destructive" className={cn("border-destructive/20 bg-destructive-bg", className)}>
      <CircleAlert />
      <AlertDescription className="text-destructive">{message}</AlertDescription>
    </Alert>
  );
}
