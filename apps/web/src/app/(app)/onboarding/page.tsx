"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardContent } from "@minarvabiz/ui";
import { getOnboardingSteps, markOnboardingDone } from "@minarvabiz/business-logic";

export default function OnboardingPage() {
  const router = useRouter();
  const [steps, setSteps] = React.useState(() => getOnboardingSteps());

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h2 className="text-xl font-semibold">Welcome — setup checklist</h2>
      {steps.map((s) => (
        <Card key={s.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{s.title}</div>
              <div className="text-xs text-slate-500">{s.done ? "Done" : "Pending"}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => router.push(s.href)}>
                Open
              </Button>
              {!s.done && (
                <Button
                  size="sm"
                  onClick={() => {
                    markOnboardingDone(s.id);
                    setSteps(getOnboardingSteps());
                  }}
                >
                  Mark done
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
