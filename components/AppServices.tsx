"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/supabase/AuthProvider";
import { syncHistory } from "@/lib/history";
import { syncSettings, useSettings } from "@/lib/settings";
import { syncBookmarks } from "@/lib/bookmarks";
import { armReminder, ensureServiceWorker } from "@/lib/reminders";

/**
 * Invisible app-wide plumbing: syncs history, settings and bookmarks with the
 * account on sign-in, registers the service worker (home-screen install and
 * notifications) and keeps the in-app reminder timer armed.
 */
export default function AppServices() {
  const { user } = useAuth();
  const settings = useSettings();

  useEffect(() => {
    if (!user) return;
    void syncSettings(user.id);
    void syncBookmarks(user.id);
    void syncHistory(user.id).then(() => window.dispatchEvent(new Event("dugsi:session")));
  }, [user]);

  useEffect(() => {
    void ensureServiceWorker();
  }, []);

  // Theme: applied to <html> so every token flips (see globals.css).
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    armReminder(settings);
    return () => armReminder({ ...settings, reminderEnabled: false });
  }, [settings]);

  return null;
}
