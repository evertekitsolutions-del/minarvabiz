"use client";

import * as React from "react";

/**
 * Marketing-only invitation, not a licensing or registration endpoint.
 * Desktop: show when the mouse leaves through the top of the viewport
 * (exit intent). Touch: show after 50% of the page has been scrolled.
 * Show once per tab session; never use a time-based interruption.
 * Deliberately does not change any trial entitlement or start a trial.
 */
const MOBILE_SCROLL_FRACTION = 0.5;
const SESSION_KEY = "minarva-biz-marketing-trial-v2";
const WINDOWS_RELEASE = "https://github.com/evertekitsolutions-del/minarvabiz/releases/tag/v1.0.15";

export default function TrialWelcomePopup() {
  const [open, setOpen] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "shown") return;
    } catch {
      // Storage can be disabled; keep the dialog dismissible.
    }

    let triggered = false;
    const isDesktopPointer = () =>
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    function showOnce() {
      if (triggered) return;
      triggered = true;
      try {
        window.sessionStorage.setItem(SESSION_KEY, "shown");
      } catch {
        // No persistent tracking; the local flag still prevents repeats.
      }
      setOpen(true);
      document.removeEventListener("mouseout", onExitIntent);
      window.removeEventListener("scroll", onMobileScroll);
    }

    function onExitIntent(event: MouseEvent) {
      // A genuine exit into browser chrome, not movement between elements.
      // Ignore side/bottom exits and touch/hybrid interaction.
      if (!isDesktopPointer() || event.relatedTarget !== null || event.clientY > 8) return;
      showOnce();
    }

    function onMobileScroll() {
      // Touch devices cannot express mouse exit intent.
      if (isDesktopPointer()) return;
      const available = document.documentElement.scrollHeight - window.innerHeight;
      if (available > 0 && window.scrollY / available >= MOBILE_SCROLL_FRACTION) {
        showOnce();
      }
    }

    document.addEventListener("mouseout", onExitIntent);
    window.addEventListener("scroll", onMobileScroll, { passive: true });
    return () => {
      document.removeEventListener("mouseout", onExitIntent);
      window.removeEventListener("scroll", onMobileScroll);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((node) => node.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#061427]/75 p-3 backdrop-blur-[5px] sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-popup-title"
        aria-describedby="trial-popup-description"
        className="relative my-auto grid w-full max-w-[1000px] overflow-y-auto rounded-[23px] bg-white shadow-[0_35px_110px_rgba(0,12,37,.42)] md:max-h-[90dvh] md:grid-cols-[1.04fr_.96fr] md:overflow-hidden"
        style={{ maxHeight: "calc(100dvh - 24px)" }}
      >
        <button
          ref={closeRef}
          type="button"
          aria-label="Close free trial offer"
          onClick={() => setOpen(false)}
          className="absolute right-3 top-3 z-20 grid size-11 place-items-center rounded-full border border-[#d8e5f5] bg-white text-xl font-bold text-[#31516f] shadow-sm transition hover:bg-[#f0f6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1760ef] sm:right-4 sm:top-4"
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="relative px-6 pb-7 pt-8 sm:px-10 sm:pb-10 sm:pt-12 lg:px-12">
          <div className="mb-6 flex items-center gap-3">
            <img src="/minarva-biz-mark.svg" alt="" width={47} height={42} className="h-10 w-[47px] object-contain" />
            <span className="text-[22px] font-black tracking-[-.055em] text-[#0a2349]">Minarva <span className="text-[#1765f0]">Biz</span></span>
          </div>

          <span className="inline-flex items-center rounded-full border border-[#bed7ff] bg-[#eaf3ff] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.14em] text-[#165de4] sm:text-xs">
            Upgrade the way you do business
          </span>
          <h2 id="trial-popup-title" className="mt-4 max-w-[480px] text-[clamp(1.8rem,3.2vw,3.15rem)] font-black leading-[1.12] tracking-[-.055em] text-[#0c2650]">
            Still making<br />paper bills?
            <span className="mt-2 block text-[#1764ef]">Go digital with Minarva Biz.</span>
          </h2>
          <p id="trial-popup-description" className="mt-4 max-w-[470px] text-[13px] leading-6 text-[#55708d] sm:text-[15px] sm:leading-7">
            Billing, inventory, GST, service jobs, customers and reports — all in one business workspace.
          </p>

          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#caddff] bg-[linear-gradient(110deg,#ecf5ff,#f8fbff)] px-4 py-4">
            <span className="text-[clamp(2.5rem,5vw,4.1rem)] font-black leading-none tracking-[-.09em] text-[#125bea]">30</span>
            <div>
              <p className="text-base font-black leading-5 text-[#103366] sm:text-lg">Days Free Trial</p>
              <p className="mt-1 text-[11px] font-medium text-[#55728f]">Experience a smarter way to manage your business.</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <a href={WINDOWS_RELEASE} target="_blank" rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#1461ed] px-5 py-3 text-center text-sm font-black text-white shadow-[0_12px_22px_rgba(19,97,237,.22)] transition hover:bg-[#0c4fcf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1765ef]">
              Explore 30-Day Trial <span aria-hidden="true" className="ml-2">→</span>
            </a>
            <button type="button" onClick={() => setOpen(false)}
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#d0def1] px-5 py-3 text-sm font-bold text-[#315374] transition hover:bg-[#f2f7ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1760ef]">
              Maybe later
            </button>
          </div>
          <p className="mt-4 text-[10px] leading-[1.65] text-[#71849c] sm:text-[11px]">
            Opens the official Windows download. Trial entitlement requires supported activation; online self-service trial signup is still being prepared.
          </p>
        </div>

        <div className="relative hidden min-h-[570px] flex-col justify-center overflow-hidden bg-[linear-gradient(145deg,#083b9f_0%,#1068ef_53%,#092a75_100%)] px-8 py-14 md:flex">
          <div className="pointer-events-none absolute -right-44 -top-36 size-[430px] rounded-full border-[65px] border-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-44 -left-32 size-[410px] rounded-full border-[55px] border-white/10" aria-hidden="true" />
          <div className="relative z-10 mb-7 text-right">
            <p className="text-[13px] font-black uppercase tracking-[.18em] text-[#c9e4ff]">Minarva Biz</p>
            <p className="mt-2 text-xl font-black tracking-tight text-white">Your business, beautifully connected.</p>
          </div>
          <div className="relative z-10 -rotate-2 rounded-2xl border-[6px] border-[#092554] bg-white shadow-[0_30px_55px_rgba(0,19,66,.42)]">
            <div className="flex h-8 items-center gap-1.5 border-b border-[#e2eaf6] bg-[#f7faff] px-3">
              <span className="size-2 rounded-full bg-[#fb978a]" /><span className="size-2 rounded-full bg-[#f9d37c]" /><span className="size-2 rounded-full bg-[#70d1a1]" />
              <span className="ml-auto text-[9px] font-bold text-[#536987]">Interface preview</span>
            </div>
            <img src="/marketing-dashboard.jpg" alt="Illustrative Minarva Biz desktop dashboard preview" width={1500} height={1000} loading="lazy" className="block w-full" />
          </div>
          <p className="relative z-10 mt-6 text-center text-[11px] font-medium text-[#cce1ff]">
            Windows desktop · Business management · Local-first workflows
          </p>
          <p className="relative z-10 mt-2 text-center text-[10px] text-[#aacdfd]">
            Illustrative interface — not live customer data.
          </p>
        </div>
      </div>
    </div>
  );
}
