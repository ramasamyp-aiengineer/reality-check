import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { AlertTriangle, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center p-8 text-center">
      <div>
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-surface-2 text-muted">
          <Compass className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted">The page you are looking for does not exist.</p>
        <Button asChild className="mt-5">
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-bad-soft text-bad">
          <AlertTriangle className="size-6" />
        </div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-1 text-sm text-muted">{error instanceof Error ? error.message : "Unexpected error"}</p>
        <Button className="mt-5" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
