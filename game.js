// ==========================================
// 1. DATOS DEL PAQUETE PRADERAS Y POOLS
// ==========================================
const PACK_COST = 100;
const STARTING_MONEY = 500;

const LOBITOS = {
  blanco:      { id: "blanco",      name: "Lobito Blanco",      rarity: "common",    baseIncome: 1 },
  marron:      { id: "marron",      name: "Lobito Marrón",      rarity: "common",    baseIncome: 2 },
  rubio:       { id: "rubio",       name: "Lobito Rubio",       rarity: "common",    baseIncome: 3 },
  jengibre:    { id: "jengibre",    name: "Lobito Jengibre",    rarity: "rare",      baseIncome: 5 },
  nubecita:    { id: "nubecita",    name: "Lobito Nubecita",    rarity: "rare",      baseIncome: 7 },
  musguito:    { id: "musguito",    name: "Lobito Musguito",    rarity: "rare",      baseIncome: 10 },
  canelita:    { id: "canelita",    name: "Lobito Canelita",    rarity: "epic",      baseIncome: 15 },
  pinchoncito: { id: "pinchoncito", name: "Lobito Pinchoncito", rarity: "epic",      baseIncome: 22 },
  rosita:      { id: "rosita",      name: "Lobito Rosita",      rarity: "legendary", baseIncome: 30 }
};

// Pesos del #1 (más común en ese tramo) al #9 (más raro) -> suman 100
const RANK_WEIGHTS = [28, 22, 16, 12, 9, 6, 4, 2, 1];

const POOLS_BY_SPEED = {
  ultraFast: ["canelita", "musguito", "pinchoncito", "nubecita", "jengibre", "rosita", "rubio", "marron", "blanco"], // <= 2.0s
  fast:      ["nubecita", "musguito", "jengibre", "rubio", "canelita", "pinchoncito", "rosita", "blanco", "marron"], // 2.0s - 3.5s
  medium:    ["rubio", "jengibre", "musguito", "nubecita", "marron", "canelita", "blanco", "pinchoncito", "rosita"], // 3.5s - 5.0s
  normal:    ["blanco", "marron", "rubio", "jengibre", "nubecita", "musguito", "canelita", "pinchoncito", "rosita"]  // >= 5.0s
};

const EDITIONS = {
  none:    { id: "none",    label: "Normal",  mult: 1.0,  rank: 0 },
  bronze:  { id: "bronze",  label: "Bronze",  mult: 1.25, rank: 1 },
  silver:  { id: "silver",  label: "Silver",  mult: 1.5,  rank: 2 },
  gold:    { id: "gold",    label: "Gold",    mult: 2.0,  rank: 3 },
  diamond: { id: "diamond", label: "Diamond", mult: 3.0,  rank: 4 },
  rainbow: { id: "rainbow", label: "Rainbow", mult: 4.0,  rank: 5 },
  galaxy:  { id: "galaxy",  label: "Galaxy",  mult: 5.0,  rank: 6 }
};

// ==========================================
// 2. ESTADO DEL JUEGO Y GUARDADO
// ==========================================
let state = {
  money: STARTING_MONEY,
  // Guardamos por cada lobito la mejor edición/shiny obtenida y cuántas copias totales tiene
  collection: {}
};

function loadState() {
  const saved = localStorage.getItem("wolfy_packs_save_v1");
  if (saved) {
    try {
      state = JSON.parse(saved);
    } catch (e) {
      console.error("Error cargando guardado:", e);
    }
  }
}

function saveState() {
  localStorage.setItem("wolfy_packs_save_v1", JSON.stringify(state));
}

// ==========================================
// 3. REFERENCIAS AL DOM
// ==========================================
const moneyDisplay = document.getElementById("money-display");
const incomeDisplay = document.getElementById("income-display");
const buyPackBtn = document.getElementById("buy-pack-btn");
const resetSaveBtn = document.getElementById("reset-save-btn");
const normalMinigameBox = document.getElementById("minigame-choice");
const normalMinigameSelect = document.getElementById("normal-minigame-select");

const puzzleArena = document.getElementById("puzzle-arena");
const puzzleTitle = document.getElementById("puzzle-title");
const puzzleTimerEl = document.getElementById("puzzle-timer");
const puzzleInstruction = document.getElementById("puzzle-instruction");
const puzzleStage = document.getElementById("puzzle-stage");

const rewardModal = document.getElementById("reward-modal");
const rewardTierInfo = document.getElementById("reward-tier-info");
const rewardCardPreview = document.getElementById("reward-card-preview");
const claimRewardBtn = document.getElementById("claim-reward-btn");

const collectionGrid = document.getElementById("collection-grid");
const unlockedCountEl = document.getElementById("unlocked-count");

let isPlayingMinigame = false;
let pendingReward = null;

// ==========================================
// 4. ECONOMÍA E INGRESOS PASIVOS
// ==========================================
function getCardIncome(lobitoId, entry) {
  if (!entry) return 0;
  const base = LOBITOS[lobitoId].baseIncome;
  const edMult = EDITIONS[entry.edition]?.mult || 1;
  const shinyMult = entry.shiny ? 1.5 : 1;
  return base * edMult * shinyMult;
}

function getTotalIncomePerSec() {
  let total = 0;
  for (const id of Object.keys(LOBITOS)) {
    if (state.collection[id]) {
      total += getCardIncome(id, state.collection[id]);
    }
  }
  return total;
}

function updateHUD() {
  const income = getTotalIncomePerSec();
  moneyDisplay.textContent = `$${state.money.toFixed(2)}`;
  incomeDisplay.textContent = `$${income.toFixed(2)}/s`;
  buyPackBtn.disabled = isPlayingMinigame || state.money < PACK_COST;
}

// Bucle de ingresos pasivos cada 100ms
setInterval(() => {
  const income = getTotalIncomePerSec();
  if (income > 0) {
    state.money += income * 0.1;
    updateHUD();
  }
}, 100);

setInterval(saveState, 3000);

// ==========================================
// 5. CRONÓMETRO CON SOPORTE DE PAUSA
// ==========================================
class PrecisionTimer {
  constructor(displayEl) {
    this.displayEl = displayEl;
    this.accumulatedMs = 0;
    this.lastStart = null;
    this.rafId = null;
  }

  reset() {
    this.pause();
    this.accumulatedMs = 0;
    this.render();
  }

  start() {
    if (this.lastStart !== null) return;
    this.lastStart = performance.now();
    this.displayEl.classList.remove("paused");
    const tick = () => {
      if (this.lastStart === null) return;
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  pause() {
    if (this.lastStart !== null) {
      this.accumulatedMs += performance.now() - this.lastStart;
      this.lastStart = null;
    }
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.displayEl.classList.add("paused");
    this.render();
  }

  getSeconds() {
    const extra = this.lastStart !== null ? performance.now() - this.lastStart : 0;
    return (this.accumulatedMs + extra) / 1000;
  }

  render() {
    this.displayEl.textContent = `${this.getSeconds().toFixed(2)}s`;
  }
}

const gameTimer = new PrecisionTimer(puzzleTimerEl);

// ==========================================
// 6. CÁLCULO DE RECOMPENSA (POOLS + EDICIONES)
// ==========================================
function rollReward(rawSeconds, isHardMode) {
  // En modo Hard (Eat the fishes), la ventana es +50% más grande:
  // 3.0s o menos equivale al bono de 2.0s o menos
  const effectiveSeconds = isHardMode ? rawSeconds / 1.5 : rawSeconds;

  let poolKey = "normal";
  let tierLabel = "Pool Normal (5s+)";

  if (effectiveSeconds <= 2.0) {
    poolKey = "ultraFast";
    tierLabel = isHardMode
      ? `⚡ Bono ≤2s (Ventana Hard +50%: ${rawSeconds.toFixed(2)}s)`
      : `⚡ Bono Ultra Rápido (${rawSeconds.toFixed(2)}s ≤ 2.0s)`;
  } else if (effectiveSeconds <= 3.5) {
    poolKey = "fast";
    tierLabel = `🔥 Bono Rápido (${rawSeconds.toFixed(2)}s)`;
  } else if (effectiveSeconds <= 5.0) {
    poolKey = `⏱️ Bono Medio (${rawSeconds.toFixed(2)}s)`;
  }

  const pool = POOLS_BY_SPEED[poolKey];
  const roll = Math.random() * 100;
  let cumulative = 0;
  let chosenId = pool[pool.length - 1];

  for (let i = 0; i < pool.length; i++) {
    cumulative += RANK_WEIGHTS[i];
    if (roll < cumulative) {
      chosenId = pool[i];
      break;
    }
  }

  // Probabilidad de Edición (mucho mayor en Hard)
  const edRoll = Math.random() * 100;
  let edition = "none";

  if (isHardMode) {
    if (edRoll < 3) edition = "galaxy";
    else if (edRoll < 9) edition = "rainbow";
    else if (edRoll < 19) edition = "diamond";
    else if (edRoll < 35) edition = "gold";
    else if (edRoll < 58) edition = "silver";
    else if (edRoll < 85) edition = "bronze";
  } else {
    if (edRoll < 0.3) edition = "galaxy";
    else if (edRoll < 1.0) edition = "rainbow";
    else if (edRoll < 2.5) edition = "diamond";
    else if (edRoll < 5.5) edition = "gold";
    else if (edRoll < 11.0) edition = "silver";
    else if (edRoll < 20.0) edition = "bronze";
  }

  // Probabilidad independiente de Shiny (combinable con cualquier edición)
  const shinyChance = isHardMode ? 0.25 : 0.05;
  const shiny = Math.random() < shinyChance;

  return {
    lobitoId: chosenId,
    edition,
    shiny,
    tierLabel,
    rawSeconds
  };
}

// ==========================================
// 7. MINIJUEGO 1: CONECTAR CABLES (3 COLORES)
// ==========================================
function startWiresMinigame(onFinish) {
  puzzleTitle.textContent = "🔌 Conectar Cables (3 Colores)";
  puzzleInstruction.textContent = "Arrastra cada cable izquierdo hacia su color a la derecha.";
  puzzleStage.innerHTML = "";

  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 190;
  canvas.style.touchAction = "none";
  puzzleStage.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const colors = [
    { id: "red", hex: "#e74c3c" },
    { id: "yellow", hex: "#f1c40f" },
    { id: "blue", hex: "#3498db" }
  ];

  const leftNodes = colors.map((c, idx) => ({
    ...c,
    x: 42,
    y: 35 + idx * 60,
    connectedTo: null
  }));

  const shuffled = [...colors].sort(() => Math.random() - 0.5);
  const rightNodes = shuffled.map((c, idx) => ({
    ...c,
    x: 278,
    y: 35 + idx * 60
  }));

  let draggingNode = null;
  let pointerPos = { x: 0, y: 0 };

  gameTimer.reset();
  gameTimer.start();

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Cables ya conectados
    for (const ln of leftNodes) {
      if (ln.connectedTo) {
        ctx.strokeStyle = ln.hex;
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(ln.x, ln.y);
        ctx.lineTo(ln.connectedTo.x, ln.connectedTo.y);
        ctx.stroke();
      }
    }

    // Cable arrastrándose
    if (draggingNode) {
      ctx.strokeStyle = draggingNode.hex;
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(draggingNode.x, draggingNode.y);
      ctx.lineTo(pointerPos.x, pointerPos.y);
      ctx.stroke();
    }

    // Terminales
    [...leftNodes, ...rightNodes].forEach((node) => {
      ctx.fillStyle = node.hex;
      ctx.beginPath();
      ctx.arc(node.x, node.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    });
  }

  function getCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function onDown(e) {
    const pos = getCoords(e);
    for (const ln of leftNodes) {
      if (!ln.connectedTo && Math.hypot(pos.x - ln.x, pos.y - ln.y) <= 24) {
        draggingNode = ln;
        pointerPos = pos;
        draw();
        break;
      }
    }
  }

  function onMove(e) {
    if (!draggingNode) return;
    e.preventDefault();
    pointerPos = getCoords(e);
    draw();
  }

  function onUp() {
    if (!draggingNode) return;
    for (const rn of rightNodes) {
      if (rn.id === draggingNode.id && Math.hypot(pointerPos.x - rn.x, pointerPos.y - rn.y) <= 28) {
        draggingNode.connectedTo = rn;
        break;
      }
    }
    draggingNode = null;
    draw();

    if (leftNodes.every((n) => n.connectedTo !== null)) {
      gameTimer.pause();
      cleanup();
      onFinish(gameTimer.getSeconds(), false);
    }
  }

  function cleanup() {
    canvas.removeEventListener("mousedown", onDown);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    canvas.removeEventListener("touchstart", onDown);
    window.removeEventListener("touchmove", onMove);
    window.removeEventListener("touchend", onUp);
  }

  canvas.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  window.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);

  draw();
}

// ==========================================
// 8. MINIJUEGO 2: SECUENCIA CON PAUSA Y REINTENTO
// ==========================================
function startSequenceMinigame(onFinish) {
  puzzleTitle.textContent = "🧠 Secuencia Rápida";
  puzzleStage.innerHTML = "";

  const colors = ["red", "yellow", "blue"];
  // Secuencia de 4 pasos (puedes ajustarlo a 3 o 5)
  const targetSequence = Array.from({ length: 4 }, () => colors[Math.floor(Math.random() * colors.length)]);

  const padsContainer = document.createElement("div");
  padsContainer.className = "seq-pads";

  const padEls = {};
  colors.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = `seq-pad ${c}`;
    btn.disabled = true;
    padsContainer.appendChild(btn);
    padEls[c] = btn;
  });

  puzzleStage.appendChild(padsContainer);

  let currentStep = 0;
  let isShowing = true;

  gameTimer.reset();

  function setPadsDisabled(disabled) {
    Object.values(padEls).forEach((b) => (b.disabled = disabled));
  }

  function playSequence() {
    isShowing = true;
    gameTimer.pause();
    setPadsDisabled(true);
    puzzleInstruction.textContent = "👀 Memoriza la secuencia (tiempo pausado)...";

    let i = 0;
    const stepInterval = setInterval(() => {
      if (i >= targetSequence.length) {
        clearInterval(stepInterval);
        isShowing = false;
        setPadsDisabled(false);
        puzzleInstruction.textContent = "⚡ ¡Tu turno! El tiempo arranca en tu primer clic.";
        return;
      }

      const color = targetSequence[i];
      const pad = padEls[color];
      pad.classList.add("active");
      setTimeout(() => pad.classList.remove("active"), 260);
      i++;
    }, 430);
  }

  Object.entries(padEls).forEach(([color, btn]) => {
    btn.addEventListener("click", () => {
      if (isShowing) return;

      // El tiempo empieza o se reanuda en el primer clic del intento
      if (currentStep === 0) {
        gameTimer.start();
      }

      if (color === targetSequence[currentStep]) {
        currentStep++;
        if (currentStep === targetSequence.length) {
          gameTimer.pause();
          setPadsDisabled(true);
          onFinish(gameTimer.getSeconds(), false);
        }
      } else {
        // Error inmediato: corta el intento, pausa tiempo y repite muestra desde 0
        gameTimer.pause();
        currentStep = 0;
        isShowing = true;
        setPadsDisabled(true);
        puzzleInstruction.textContent = "❌ ¡Fallaste! Repitiendo secuencia desde cero...";
        setTimeout(() => playSequence(), 650);
      }
    });
  });

  playSequence();
}

// ==========================================
// 9. MINIJUEGO 3 (HARD): EAT THE FISHES
// ==========================================
function startEatTheFishesMinigame(onFinish) {
  puzzleTitle.textContent = "🔥 HARD: Eat the Fishes";
  puzzleInstruction.textContent = "Devora los 3 pescados (3–6 clics c/u). ¡Tienes hasta 3.0s para el bono máximo!";
  puzzleStage.innerHTML = "";

  const totalFishes = 3;
  // Cada pescado requiere entre 3 y 6 clics aleatorios
  const fishTargets = Array.from({ length: totalFishes }, () => Math.floor(Math.random() * 4) + 3);
  let currentFish = 0;
  let clicksLeft = fishTargets[0];

  const arena = document.createElement("div");
  arena.className = "fish-arena";

  const progressEl = document.createElement("div");
  progressEl.className = "fish-progress";

  const fishBtn = document.createElement("button");
  fishBtn.className = "fish-btn";
  fishBtn.textContent = "🐟";

  const clicksEl = document.createElement("div");
  clicksEl.className = "fish-clicks-left";

  arena.append(progressEl, fishBtn, clicksEl);
  puzzleStage.appendChild(arena);

  function renderFish() {
    progressEl.textContent = `Pescado ${currentFish + 1} de ${totalFishes}`;
    clicksEl.textContent = `Faltan ${clicksLeft} mordiscos`;
  }

  gameTimer.reset();
  gameTimer.start();
  renderFish();

  fishBtn.addEventListener("click", () => {
    clicksLeft--;
    if (clicksLeft <= 0) {
      currentFish++;
      if (currentFish >= totalFishes) {
        gameTimer.pause();
        fishBtn.disabled = true;
        onFinish(gameTimer.getSeconds(), true);
        return;
      }
      clicksLeft = fishTargets[currentFish];
    }
    renderFish();
  });
}

// ==========================================
// 10. RENDERIZADO DE CARTAS Y COLECCIÓN
// ==========================================
function buildCardHTML(lobitoId, edition = "none", shiny = false, count = null, locked = false) {
  const info = LOBITOS[lobitoId];
  const edObj = EDITIONS[edition] || EDITIONS.none;
  const income = info.baseIncome * edObj.mult * (shiny ? 1.5 : 1);

  const classes = [
    "lobito-card",
    locked ? "locked" : "",
    edition !== "none" ? `ed-${edition}` : "",
    shiny ? "is-shiny" : ""
  ].filter(Boolean).join(" ");

  return `
    <div class="${classes}">
      <div class="lobito-art art-${lobitoId}">
        <span class="lobito-silhouette">🐺</span>
      </div>
      <div class="card-name">${locked ? "???" : info.name}</div>
      <div class="card-tags">
        <span class="tag rarity-${info.rarity}">${info.rarity}</span>
        ${edition !== "none" ? `<span class="tag">${edObj.label}</span>` : ""}
        ${count ? `<span class="tag">x${count}</span>` : ""}
      </div>
      <div class="card-income">
        ${locked ? `Base: $${info.baseIncome}/s` : `+$${income.toFixed(2)}/s`}
      </div>
    </div>
  `;
}

function renderCollection() {
  let unlocked = 0;
  let html = "";

  for (const id of Object.keys(LOBITOS)) {
    const entry = state.collection[id];
    if (entry) {
      unlocked++;
      html += buildCardHTML(id, entry.edition, entry.shiny, entry.count, false);
    } else {
      html += buildCardHTML(id, "none", false, null, true);
    }
  }

  unlockedCountEl.textContent = unlocked;
  collectionGrid.innerHTML = html;
}

// ==========================================
// 11. FLUJO DE COMPRA Y EVENTOS
// ==========================================
document.querySelectorAll('input[name="gameMode"]').forEach((radio) => {
  radio.addEventListener("change", (e) => {
    normalMinigameBox.style.display = e.target.value === "hard" ? "none" : "flex";
  });
});

buyPackBtn.addEventListener("click", () => {
  if (isPlayingMinigame || state.money < PACK_COST) return;

  state.money -= PACK_COST;
  isPlayingMinigame = true;
  updateHUD();

  const selectedMode = document.querySelector('input[name="gameMode"]:checked').value;
  puzzleArena.classList.remove("hidden");

  const handleComplete = (seconds, isHard) => {
    const reward = rollReward(seconds, isHard);
    pendingReward = reward;

    rewardTierInfo.textContent = reward.tierLabel;
    rewardCardPreview.outerHTML = buildCardHTML(
      reward.lobitoId,
      reward.edition,
      reward.shiny,
      null,
      false
    ).replace('class="lobito-card', 'id="reward-card-preview" class="lobito-card large');

    rewardModal.classList.remove("hidden");
  };

  if (selectedMode === "hard") {
    startEatTheFishesMinigame(handleComplete);
  } else {
    let choice = normalMinigameSelect.value;
    if (choice === "random") {
      choice = Math.random() < 0.5 ? "wires" : "sequence";
    }
    if (choice === "wires") {
      startWiresMinigame(handleComplete);
    } else {
      startSequenceMinigame(handleComplete);
    }
  }
});

claimRewardBtn.addEventListener("click", () => {
  if (!pendingReward) return;

  const { lobitoId, edition, shiny } = pendingReward;
  const existing = state.collection[lobitoId];

  if (!existing) {
    state.collection[lobitoId] = { edition, shiny, count: 1 };
  } else {
    existing.count += 1;
    // Conserva la edición de mayor rango y el estado shiny si ya lo tenía o acaba de salir
    if (EDITIONS[edition].rank > EDITIONS[existing.edition].rank) {
      existing.edition = edition;
    }
    if (shiny) {
      existing.shiny = true;
    }
  }

  pendingReward = null;
  isPlayingMinigame = false;
  rewardModal.classList.add("hidden");
  puzzleArena.classList.add("hidden");

  saveState();
  renderCollection();
  updateHUD();
});

resetSaveBtn.addEventListener("click", () => {
  if (confirm("¿Reiniciar tu partida y volver a $500 Wolfichas?")) {
    localStorage.removeItem("wolfy_packs_save_v1");
    state = { money: STARTING_MONEY, collection: {} };
    renderCollection();
    updateHUD();
  }
});

// Inicializar juego
loadState();
renderCollection();
updateHUD();
