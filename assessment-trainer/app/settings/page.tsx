"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

interface Settings {
  storeImages: boolean;
  perQuestionSeconds: number;
  defaultSessionSize: number;
}
interface Health {
  python: { ok: boolean; opencv?: string; error?: string };
  providers: { vision: string; text: string; reasoning: string; matrixFallback?: string };
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setS);
    fetch("/api/health").then((r) => r.json()).then(setHealth);
  }, []);

  async function update(patch: Partial<Settings>) {
    setS(await fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) }).then((r) => r.json()));
  }

  async function wipe(scope: "images" | "history" | "all") {
    const text = { images: "Delete all stored screenshots?", history: "Delete all practice history and statistics?", all: "Delete ALL data (questions, history, settings, images)?" }[scope];
    if (!window.confirm(text)) return;
    await fetch(`/api/data?scope=${scope}`, { method: "DELETE" });
    setMsg(scope === "all" ? "All data cleared." : scope === "history" ? "History deleted." : "Images deleted.");
    if (scope === "all") fetch("/api/settings").then((r) => r.json()).then(setS);
  }

  return (
    <>
      <PageHeader title="Settings" description="Privacy, AI providers and data management." />
      {msg && <Alert tone="good" title={msg} className="mb-4" />}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
            <CardDescription>Screenshots are analysed in memory and not stored unless you enable it.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="store" className="text-sm">
                Store uploaded screenshots
              </label>
              {s && <Switch id="store" label="Store uploaded screenshots" checked={s.storeImages} onChange={(v) => update({ storeImages: v })} />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vision & AI providers</CardTitle>
            <CardDescription>Configured with environment variables (see README). Matrices the local pipeline can read are always decided by the rule verifier.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!health ? (
              <p className="text-muted-foreground">Checking…</p>
            ) : (
              <>
                <p className="flex items-center gap-2">
                  Python / OpenCV:{" "}
                  {health.python.ok ? <Badge variant="good">OK · OpenCV {health.python.opencv}</Badge> : <Badge variant="bad">not available</Badge>}
                </p>
                {!health.python.ok && <p className="text-xs text-bad">{health.python.error}</p>}
                <p>Vision: {health.providers.vision}</p>
                <p>Text: {health.providers.text}</p>
                <p>Reasoning: {health.providers.reasoning}</p>
                {health.providers.matrixFallback && <p>Unknown matrix layouts: {health.providers.matrixFallback}</p>}
              </>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Data</CardTitle>
            <CardDescription>Everything is stored locally in SQLite. These actions cannot be undone.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => wipe("images")}>
              Delete images
            </Button>
            <Button variant="outline" onClick={() => wipe("history")}>
              Delete history
            </Button>
            <Button variant="destructive" onClick={() => wipe("all")}>
              Clear all data
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
