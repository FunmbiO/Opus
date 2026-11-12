import { useState } from "react";

const KEY = "opus-install-tip-dismissed";

/** iPhone Safari cannot show an install prompt, so say how to add Opus to the home screen. Shown once. */
export function InstallTip() {
  const [gone, setGone] = useState(() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } });
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  if (!ios || standalone || gone) return null;
  const dismiss = () => { setGone(true); try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } };
  return (
    <div className="install-tip" role="note">
      <div>
        <b>Install Opus on your iPhone</b>
        <p>In Safari, tap <svg className="share" viewBox="0 0 24 24" width="18" height="18" aria-label="Share" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M8 7l4-4 4 4" /><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" /></svg> Share, then <b>Add to Home Screen</b>. Opus opens full screen, like an app.</p>
      </div>
      <button className="icon-btn" onClick={dismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}
