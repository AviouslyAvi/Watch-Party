(() => {
  const urlInput = document.getElementById("video-url");
  const createBtn = document.getElementById("create-btn");
  const copyBtn = document.getElementById("copy-btn");
  const hint = document.getElementById("hint");
  const invited = document.getElementById("invited");
  const invitedUrl = document.getElementById("invited-url");
  const invitedContinue = document.getElementById("invited-continue");
  const invitedStatus = document.getElementById("invited-status");

  let lastLink = "";

  function buildRoomUrl(raw) {
    let u;
    try {
      u = new URL(raw);
    } catch {
      return null;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const roomId = crypto.randomUUID().slice(0, 8);
    const h = new URLSearchParams(u.hash.replace(/^#/, ""));
    h.set("party", roomId);
    u.hash = h.toString();
    return u.toString();
  }

  function setHint(msg, ok) {
    hint.textContent = msg;
    hint.style.color = ok ? "#34d399" : "#f87171";
  }

  createBtn.addEventListener("click", () => {
    const link = buildRoomUrl(urlInput.value.trim());
    if (!link) {
      setHint("That doesn't look like a valid http(s) URL.", false);
      copyBtn.disabled = true;
      return;
    }
    lastLink = link;
    copyBtn.disabled = false;
    setHint("Opening room…", true);
    window.open(link, "_blank", "noopener");
  });

  copyBtn.addEventListener("click", async () => {
    if (!lastLink) return;
    try {
      await navigator.clipboard.writeText(lastLink);
      setHint("Invite link copied. Send it to your friends.", true);
    } catch {
      setHint("Couldn't copy. Link: " + lastLink, false);
    }
  });

  urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createBtn.click();
  });

  // ---- Invited mode ----

  function base64urlDecode(s) {
    try {
      const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
      const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
      return decodeURIComponent(escape(atob(b64)));
    } catch {
      return null;
    }
  }

  function parseInviteFragment() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    const vEncoded = params.get("v");
    const party = params.get("party");
    if (!vEncoded || !party) return null;
    const decoded = base64urlDecode(vEncoded);
    if (!decoded) return { error: "broken" };
    let u;
    try {
      u = new URL(decoded);
    } catch {
      return { error: "broken" };
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "broken" };
    return { videoUrl: decoded, party, key: params.get("key") || null };
  }

  function buildPartyTargetUrl(videoUrl, party, key) {
    const u = new URL(videoUrl);
    const h = new URLSearchParams(u.hash.replace(/^#/, ""));
    h.set("party", party);
    if (key) h.set("key", key);
    u.hash = h.toString();
    return u.toString();
  }

  function isExtensionInstalled() {
    return document.documentElement.dataset.watchPartyInstalled === "1";
  }

  function showInvited(invite) {
    document.querySelectorAll("section.step").forEach((s) => {
      // Keep the install step (1) visible, hide the create step (2) and join blurb (3).
      if (s.querySelector(".num")?.textContent !== "1") s.hidden = true;
    });
    invited.hidden = false;

    if (invite.error) {
      invited.innerHTML =
        '<h2>This invite link looks broken</h2><p class="hint">Ask the sender to copy the link again from the Watch-Party panel.</p>';
      return;
    }

    const target = buildPartyTargetUrl(invite.videoUrl, invite.party, invite.key);
    invitedUrl.textContent = invite.videoUrl;
    invitedUrl.href = target;
    invitedContinue.addEventListener("click", () => {
      window.location.href = target;
    });

    // Try to auto-forward if the extension is already installed.
    let attempts = 0;
    const tryAutoForward = () => {
      attempts++;
      if (isExtensionInstalled()) {
        invitedStatus.textContent = "Extension detected — opening in 1.5s…";
        invitedStatus.style.color = "#34d399";
        let n = 15;
        const tick = setInterval(() => {
          n--;
          if (n <= 0) {
            clearInterval(tick);
            window.location.href = target;
          }
        }, 100);
        // Let the user cancel by clicking anywhere else.
        document.addEventListener(
          "click",
          (e) => {
            if (e.target !== invitedContinue) {
              clearInterval(tick);
              invitedStatus.textContent = "Auto-forward cancelled. Click Continue when ready.";
              invitedStatus.style.color = "";
            }
          },
          { once: true, capture: true }
        );
        return;
      }
      if (attempts < 10) setTimeout(tryAutoForward, 200);
    };
    tryAutoForward();
  }

  const invite = parseInviteFragment();
  if (invite) showInvited(invite);
})();
