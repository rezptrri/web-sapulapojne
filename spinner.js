/* ===========================================================
   Spinner giliran (roda) — sapulapojne
   =========================================================== */
const MEMBERS = ["Saira", "April", "Putri", "Lala", "Fauziah", "Neva"];

const MEMBER_COLORS = {
  saira: "#7b2d3b",
  april: "#33415c",
  putri: "#cdb8e8",
  lala: "#cfcac0",
  fauziah: "#9cb98a",
  neva: "#e88fae",
};

function memberColor(name) {
  return MEMBER_COLORS[(name || "").toLowerCase()] || "#8fa888";
}

function initSpinner(containerId = "spinner") {
  const root = document.getElementById(containerId);
  if (!root) return;

  const sliceAngle = 360 / MEMBERS.length;
  let currentRotation = 0;
  let lastPicked = null;
  let spinning = false;

  const gradientStops = MEMBERS.map((m, i) => {
    const from = (i * sliceAngle).toFixed(2);
    const to = ((i + 1) * sliceAngle).toFixed(2);
    return `${memberColor(m)} ${from}deg ${to}deg`;
  }).join(", ");

  const labelsHtml = MEMBERS.map((m, i) => {
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
      <p class="sp-result-name" id="sp-name">— pencet putar —</p>
      <button class="sp-btn" id="sp-spin">Putar</button>
    </div>
  `;

  const wheelEl = document.getElementById("sp-wheel");
  const nameEl = document.getElementById("sp-name");
  const spinBtn = document.getElementById("sp-spin");

  function pickIndex() {
    const candidates = MEMBERS.map((m, i) => i).filter(
      (i) => MEMBERS[i] !== lastPicked
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
        const picked = MEMBERS[targetIndex];
        lastPicked = picked;
        nameEl.innerHTML = `<span class="sp-badge" style="background:${memberColor(picked)}"></span>${picked}`;
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
