"use client";

import * as React from "react";
import { Button } from "./Button";

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
            <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
            <p className="max-w-md text-sm text-slate-500">{this.state.error.message}</p>
            <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
