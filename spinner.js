/* ===========================================================
   Spinner giliran (roda) — sapulapojne
   =========================================================== */
(function () {
  const SP_MEMBERS = ["Saira", "April", "Putri", "Lala", "Fauziah", "Neva"];

  const SP_COLORS = {
    saira: "#7b2d3b",
    april: "#33415c",
    putri: "#cdb8e8",
    lala: "#cfcac0",
    fauziah: "#9cb98a",
    neva: "#e88fae",
  };

  function spColor(name) {
    return SP_COLORS[(name || "").toLowerCase()] || "#8fa888";
  }

  function initSpinner(containerId = "spinner") {
    const root = document.getElementById(containerId);
    if (!root) return;

    const sliceAngle = 360 / SP_MEMBERS.length;
    let currentRotation = 0;
    let lastPicked = null;
    let spinning = false;

    const gradientStops = SP_MEMBERS.map((m, i) => {
      const from = (i * sliceAngle).toFixed(2);
      const to = ((i + 1) * sliceAngle).toFixed(2);
      return `${spColor(m)} ${from}deg ${to}deg`;
    }).join(", ");

    const labelsHtml = SP_MEMBERS.map((m, i) => {
      const theta = i * sliceAngle + sliceAngle / 2;
      return `<div class="sp-wheel-label" style="transform: rotate(${theta}deg) translate(0, -95px); text-align:center;">${m}</div>`;
    }).join("");

    root.innerHTML = `
      <div class="sp-wrap">
        <div class="sp-pointer-row"><div class="sp-pointer"></div></div>
        <div class="sp-wheel-outer">
          <div class="sp-wheel" id="sp-wheel" style="background: conic-gradient(${gradientStops});">
            ${labelsHtml}
          </div>
          <div class="sp-wheel-center"></div>
        </div>
        <p class="sp-result-label">Giliran</p>
        <p class="sp-result-name" id="sp-name">nungguin yeak?</p>
        <button class="sp-btn" id="sp-spin">Putar</button>
      </div>
    `;

    const wheelEl = document.getElementById("sp-wheel");
    const nameEl = document.getElementById("sp-name");
    const spinBtn = document.getElementById("sp-spin");

    function pickIndex() {
      const candidates = SP_MEMBERS.map((m, i) => i).filter(
        (i) => SP_MEMBERS[i] !== lastPicked
      );
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    function spin() {
      if (spinning) return;
      spinning = true;
      spinBtn.disabled = true;
      nameEl.textContent = "…";

      const targetIndex = pickIndex();
      const targetCenter = targetIndex * sliceAngle + sliceAngle / 2;
      const deltaToAlign = (360 - (targetCenter % 360)) % 360;
      const extraSpins = 6;
      let base = Math.ceil(currentRotation / 360) * 360;
      let targetRotation = base + extraSpins * 360 + deltaToAlign;
      if (targetRotation <= currentRotation) targetRotation += 360;

      wheelEl.style.transform = `rotate(${targetRotation}deg)`;
      currentRotation = targetRotation;

      wheelEl.addEventListener(
        "transitionend",
        function handler() {
          wheelEl.removeEventListener("transitionend", handler);
          const picked = SP_MEMBERS[targetIndex];
          lastPicked = picked;
          nameEl.innerHTML = `<span class="sp-badge" style="background:${spColor(picked)}"></span>${picked}`;
          spinBtn.disabled = false;
          spinning = false;
        },
        { once: true }
      );
    }

    spinBtn.addEventListener("click", spin);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("spinner")) initSpinner();
  });
})();
