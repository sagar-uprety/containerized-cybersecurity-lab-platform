import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/components/ui/button";

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-2 bg-background p-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
          <p className="mb-2 text-sm text-muted-foreground">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <Button onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}>
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
