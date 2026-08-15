/* ===========================================================
   Block Blast — sapulapojne
   =========================================================== */
(function () {
  const SUPABASE_URL =
    window.SUPABASE_URL || "https://yatmsttajhpdzmhcqyup.supabase.co";
  const SUPABASE_ANON_KEY =
    window.SUPABASE_ANON_KEY ||
    "sb_publishable_S2BYuyE3pHyE7bLPCYJ0aQ_gVL0fdW9";

  const BB_COLORS = {
    saira: "#7b2d3b",
    april: "#33415c",
    putri: "#cdb8e8",
    lala: "#9a9891",
    fauziah: "#9cb98a",
    neva: "#e88fae",
  };

  function bbColor(name) {
    if (!name) return "#8fa888";
    return BB_COLORS[name.toLowerCase()] || "#8fa888";
  }

  function getCurrentMember() {
    try {
      return localStorage.getItem("sapulapojne_user") || "Saira";
    } catch (e) {
      return "Saira";
    }
  }

  let sb = null;
  function getClient() {
    if (!sb && window.supabase) {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return sb;
  }

  async function saveScore(memberName, score) {
    const client = getClient();
    if (!client) return;
    try {
      await client.from("game_scores").insert({ member_name: memberName, score });
    } catch (err) {
      console.error("gagal nyimpen skor:", err);
    }
  }

  async function fetchLeaderboard() {
    const client = getClient();
    if (!client) return [];
    try {
      const { data, error } = await client
        .from("game_scores")
        .select("member_name, score")
        .order("score", { ascending: false })
        .limit(100);
      if (error) throw error;

      const best = {};
      (data || []).forEach((row) => {
        const key = row.member_name.toLowerCase();
        if (!best[key] || row.score > best[key].score) {
          best[key] = { member_name: row.member_name, score: row.score };
        }
      });
      return Object.values(best).sort((a, b) => b.score - a.score);
    } catch (err) {
      console.error("gagal ambil leaderboard:", err);
      return [];
    }
  }

  const SIZE = 8;
  const SHAPES = [
    [[0, 0]],
    [[0, 0], [0, 1]],
    [[0, 0], [1, 0]],
    [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [0, 1], [1, 0], [1, 1]],
    [[0, 0], [1, 0], [1, 1]],
    [[0, 1], [1, 0], [1, 1]],
    [[0, 0], [0, 1], [0, 2], [1, 1]],
    [[0, 0], [0, 1], [1, 0]],
  ];

  function initBlockBlast(containerId = "blockblast") {
    const root = document.getElementById(containerId);
    if (!root) return;

    const member = getCurrentMember();
    const myColor = bbColor(member);

    root.innerHTML = `
      <div class="bb-wrap">
        <div class="bb-header">
          <div>
            <p class="bb-score-label">Skor — ${member}</p>
            <p class="bb-score-value" id="bb-score">0</p>
          </div>
          <button class="bb-btn" id="bb-restart">Ulang</button>
        </div>
        <div class="bb-board" id="bb-board"></div>
        <div class="bb-message" id="bb-message"></div>
        <div class="bb-tray" id="bb-tray"></div>
        <div class="bb-leaderboard">
          <h3>Leaderboard sapulapojne</h3>
          <div id="bb-lb-list"><p class="bb-lb-empty">Memuat...</p></div>
        </div>
      </div>
    `;

    let board = [];
    let tray = [];
    let selected = -1;
    let score = 0;

    const boardEl = document.getElementById("bb-board");
    const trayEl = document.getElementById("bb-tray");
    const scoreEl = document.getElementById("bb-score");
    const msgEl = document.getElementById("bb-message");
    const restartBtn = document.getElementById("bb-restart");
    const lbListEl = document.getElementById("bb-lb-list");

    function newBoard() {
      board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    }

    function randomPiece() {
      const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      return { shape, color: myColor };
    }

    function newTray() {
      tray = [randomPiece(), randomPiece(), randomPiece()];
      selected = -1;
    }

    function boundingBox(shape) {
      let maxR = 0, maxC = 0;
      shape.forEach(([r, c]) => {
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      });
      return { rows: maxR + 1, cols: maxC + 1 };
    }

    function canPlace(shape, r0, c0) {
      return shape.every(([dr, dc]) => {
        const r = r0 + dr, c = c0 + dc;
        return r >= 0 && r < SIZE && c >= 0 && c < SIZE && !board[r][c];
      });
    }

    function pieceFitsAnywhere(shape) {
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (canPlace(shape, r, c)) return true;
      return false;
    }

    function isGameOver() {
      return tray.every((p) => !p || !pieceFitsAnywhere(p.shape));
    }

    function clearLines() {
      const fullRows = [];
      const fullCols = [];
      for (let r = 0; r < SIZE; r++) if (board[r].every((v) => v)) fullRows.push(r);
      for (let c = 0; c < SIZE; c++) if (board.every((row) => row[c])) fullCols.push(c);
      fullRows.forEach((r) => (board[r] = Array(SIZE).fill(null)));
      fullCols.forEach((c) => board.forEach((row) => (row[c] = null)));
      const lines = fullRows.length + fullCols.length;
      if (lines > 0) score += lines * 10;
    }

    async function endGame() {
      msgEl.textContent = "Papan penuh — game over. Skor tersimpan ke leaderboard.";
      await saveScore(member, score);
      renderLeaderboard();
    }

    function placePiece(idx, r0, c0) {
      const piece = tray[idx];
      if (!piece || !canPlace(piece.shape, r0, c0)) return;
      piece.shape.forEach(([dr, dc]) => (board[r0 + dr][c0 + dc] = piece.color));
      score += piece.shape.length;
      tray[idx] = null;
      selected = -1;
      clearLines();
      if (tray.every((p) => p === null)) newTray();
      renderAll();
      if (isGameOver()) endGame();
    }

    function renderBoard() {
      boardEl.innerHTML = "";
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const cell = document.createElement("div");
          cell.className = "bb-cell" + (board[r][c] ? " bb-filled" : "");
          if (board[r][c]) cell.style.background = board[r][c];
          cell.addEventListener("click", () => {
            if (selected >= 0) placePiece(selected, r, c);
          });
          boardEl.appendChild(cell);
        }
      }
    }

    function renderTray() {
      trayEl.innerHTML = "";
      tray.forEach((piece, idx) => {
        const box = document.createElement("div");
        box.className =
          "bb-piece" +
          (idx === selected ? " bb-selected" : "") +
          (!piece ? " bb-empty" : "");

        if (piece) {
          const bb = boundingBox(piece.shape);
          const grid = document.createElement("div");
          grid.className = "bb-piece-grid";
          grid.style.gridTemplateColumns = `repeat(${bb.cols}, 13px)`;
          grid.style.gridTemplateRows = `repeat(${bb.rows}, 13px)`;
          for (let r = 0; r < bb.rows; r++) {
            for (let c = 0; c < bb.cols; c++) {
              const filled = piece.shape.some(([pr, pc]) => pr === r && pc === c);
              const mc = document.createElement("div");
              mc.className = "bb-piece-cell";
              mc.style.background = filled ? piece.color : "transparent";
              grid.appendChild(mc);
            }
          }
          box.appendChild(grid);
          box.addEventListener("click", () => {
            selected = selected === idx ? -1 : idx;
            renderTray();
          });
        }
        trayEl.appendChild(box);
      });
    }

    async function renderLeaderboard() {
      const rows = await fetchLeaderboard();
      if (!rows.length) {
        lbListEl.innerHTML =
          '<p class="bb-lb-empty">Belum ada skor. Jadi yang pertama!</p>';
        return;
      }
      lbListEl.innerHTML = rows
        .slice(0, 6)
        .map(
          (row, i) => `
          <div class="bb-lb-row">
            <span class="bb-lb-rank">${i + 1}</span>
            <span class="bb-lb-dot" style="background:${bbColor(row.member_name)}"></span>
            <span class="bb-lb-name">${row.member_name}</span>
            <span class="bb-lb-score">${row.score}</span>
          </div>`
        )
        .join("");
    }

    function renderAll() {
      scoreEl.textContent = score;
      renderBoard();
      renderTray();
    }

    restartBtn.addEventListener("click", () => {
      score = 0;
      msgEl.textContent = "";
      newBoard();
      newTray();
      renderAll();
    });

    newBoard();
    newTray();
    renderAll();
    renderLeaderboard();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("blockblast")) initBlockBlast();
  });
})();
