"use client";

import { useEffect } from "react";

export function DevRedirect() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEV_REDIRECT !== "1") return;
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    // 127.0.0.1 + API на 127.0.0.1 — один сайт, куки живут.
    if (host !== "127.0.0.1" && host !== "") {
      window.location.replace(
        "http://127.0.0.1:3000" + window.location.pathname + window.location.search
      );
    }
  }, []);
  return null;
}