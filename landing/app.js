(() => {
  const urlInput = document.getElementById("cineby-url");
  const createBtn = document.getElementById("create-btn");
  const copyBtn = document.getElementById("copy-btn");
  const hint = document.getElementById("hint");

  let lastLink = "";

  function buildRoomUrl(raw) {
    let u;
    try {
      u = new URL(raw);
    } catch {
      return null;
    }
    if (!/(^|\.)cineby\.sc$/i.test(u.hostname)) return null;
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
      setHint("That doesn't look like a cineby.sc URL.", false);
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
})();
