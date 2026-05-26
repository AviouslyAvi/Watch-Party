export interface CoachStep {
  anchor: () => HTMLElement | null;
  text: string;
  placement?: "left" | "bottom" | "auto";
}

interface CoachmarkRefs {
  backdrop: HTMLDivElement;
  tooltip: HTMLDivElement;
  spotlight: HTMLDivElement;
}

const ONBOARDED_KEY = "cp-onboarded-v1";

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {}
}

export function resetOnboarded() {
  try {
    localStorage.removeItem(ONBOARDED_KEY);
  } catch {}
}

export function runCoachmark(steps: CoachStep[]): void {
  if (steps.length === 0) return;

  const refs = buildOverlay();
  let i = 0;

  function cleanup() {
    refs.backdrop.remove();
    refs.tooltip.remove();
    refs.spotlight.remove();
    document.removeEventListener("keydown", onKey);
  }

  function finish() {
    markOnboarded();
    cleanup();
  }

  function render() {
    const step = steps[i];
    if (!step) return finish();
    const anchorEl = step.anchor();
    if (!anchorEl) {
      // Anchor not in DOM — skip this step.
      i++;
      return render();
    }
    placeSpotlight(refs.spotlight, anchorEl);
    placeTooltip(refs.tooltip, anchorEl, step.placement ?? "auto", step.text, {
      stepIndex: i,
      stepCount: steps.length,
      next: () => {
        i++;
        if (i >= steps.length) finish();
        else render();
      },
      skip: finish,
    });
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") finish();
  }
  document.addEventListener("keydown", onKey);
  render();
}

function buildOverlay(): CoachmarkRefs {
  const backdrop = document.createElement("div");
  backdrop.id = "cp-coach-backdrop";
  backdrop.style.cssText = `
    position:fixed;inset:0;z-index:2147483645;
    background:rgba(0,0,0,0.6);
    pointer-events:auto;
  `;
  document.body.appendChild(backdrop);

  const spotlight = document.createElement("div");
  spotlight.id = "cp-coach-spotlight";
  spotlight.style.cssText = `
    position:fixed;z-index:2147483646;pointer-events:none;
    box-shadow:0 0 0 9999px rgba(0,0,0,0.65);
    border-radius:8px;transition:all 200ms ease;
  `;
  document.body.appendChild(spotlight);

  const tooltip = document.createElement("div");
  tooltip.id = "cp-coach-tooltip";
  tooltip.style.cssText = `
    position:fixed;z-index:2147483647;
    background:#141416;color:#eee;
    border:1px solid #333;border-radius:8px;
    padding:12px 14px;max-width:280px;
    font:13px system-ui,sans-serif;line-height:1.4;
    box-shadow:0 8px 32px rgba(0,0,0,0.6);
  `;
  document.body.appendChild(tooltip);

  // Backdrop swallows clicks outside the spotlight but doesn't dismiss.
  backdrop.addEventListener("click", (e) => e.stopPropagation());

  return { backdrop, tooltip, spotlight };
}

function placeSpotlight(el: HTMLDivElement, anchor: HTMLElement) {
  const r = anchor.getBoundingClientRect();
  const pad = 6;
  el.style.left = `${r.left - pad}px`;
  el.style.top = `${r.top - pad}px`;
  el.style.width = `${r.width + pad * 2}px`;
  el.style.height = `${r.height + pad * 2}px`;
}

function placeTooltip(
  el: HTMLDivElement,
  anchor: HTMLElement,
  placement: "left" | "bottom" | "auto",
  text: string,
  ctx: { stepIndex: number; stepCount: number; next: () => void; skip: () => void },
) {
  el.innerHTML = `
    <div style="margin-bottom:10px;">${text}</div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
      <span style="color:#888;font-size:11px;">${ctx.stepIndex + 1} / ${ctx.stepCount}</span>
      <div style="display:flex;gap:6px;">
        <button id="cp-coach-skip" style="background:transparent;color:#bbb;border:1px solid #333;border-radius:4px;padding:4px 10px;cursor:pointer;font:inherit;">Skip</button>
        <button id="cp-coach-next" style="background:#f97316;color:#fff;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font:inherit;font-weight:600;">${ctx.stepIndex === ctx.stepCount - 1 ? "Done" : "Next"}</button>
      </div>
    </div>
  `;
  // Measure then position.
  el.style.left = "-9999px";
  el.style.top = "0";
  requestAnimationFrame(() => {
    const r = anchor.getBoundingClientRect();
    const tr = el.getBoundingClientRect();
    let pick: "left" | "bottom" = placement === "auto" ? "left" : placement;
    if (placement === "auto" && r.left < tr.width + 20) pick = "bottom";

    let left: number;
    let top: number;
    if (pick === "left") {
      left = Math.max(8, r.left - tr.width - 16);
      top = Math.max(8, r.top);
    } else {
      left = Math.max(8, r.left);
      top = Math.min(window.innerHeight - tr.height - 8, r.bottom + 12);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });

  const nextBtn = el.querySelector("#cp-coach-next") as HTMLButtonElement;
  const skipBtn = el.querySelector("#cp-coach-skip") as HTMLButtonElement;
  nextBtn.addEventListener("click", ctx.next);
  skipBtn.addEventListener("click", ctx.skip);
}
