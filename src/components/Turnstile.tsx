import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile ("I'm human") widget.
 *
 * Renders the widget explicitly and hands the token to `onToken`. The token
 * is single-use and expires after ~5 minutes; on expiry we emit "" so the
 * caller can disable its submit button.
 *
 * Site key comes from VITE_TURNSTILE_SITE_KEY (Keys tab). The fallback is
 * Cloudflare's official always-passes test key, so the UI still works before
 * the real key is configured — pair it with TURNSTILE_SECRET_KEY server-side.
 */
const SITE_KEY =
  (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) ||
  "1x00000000000000000000AA";
const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      theme?: "dark" | "light" | "auto";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function Turnstile({
  onToken,
  theme = "dark",
  className,
}: {
  onToken: (token: string) => void;
  theme?: "dark" | "light" | "auto";
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const tokenRef = useRef(onToken);

  useEffect(() => {
    tokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || widgetId.current !== null) return;
      const container = containerRef.current;
      const api = window.turnstile;
      if (!container || !api) return;
      widgetId.current = api.render(container, {
        sitekey: SITE_KEY,
        theme,
        callback: (token: string) => tokenRef.current(token),
        "expired-callback": () => tokenRef.current(""),
        "error-callback": () => tokenRef.current(""),
      });
    };

    if (window.turnstile) {
      renderWidget();
      return () => {
        cancelled = true;
      };
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", renderWidget);
    return () => {
      cancelled = true;
      script?.removeEventListener("load", renderWidget);
    };
  }, [theme]);

  useEffect(() => {
    return () => {
      const api = window.turnstile;
      if (api && widgetId.current !== null) {
        try {
          api.remove(widgetId.current);
        } catch {
          /* widget already gone */
        }
        widgetId.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} className={className} />;
}
