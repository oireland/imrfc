"use client";

import { useEffect } from "react";

/** Registers the service worker once per session, wherever the app is mounted. */
export function PushRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
