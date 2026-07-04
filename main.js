import Sound from "./sound.js";

const BOARD_SIZE = 9;
const STORAGE_KEYS = {
  PLAY_DATA: "numberPlacePlayData",
  PROBLEMS: "numberPlaceProblems",
};

const state = {
  mode: "list",

  board: createEmptyBoard(),
  givenBoard: createEmptyBoard(),

  selectedCell: null,
  selectedNumber: null,

  highlightEnabled: true,
  errorCells: new Set(),

  elapsedSeconds: 0,
  sessionStartTime: null,
  timerInterval: null,
  problems: [],
};

const sound = new Sound();

const vibrate =
  navigator.vibrate?.bind(navigator) ??
  (() => {});

function vibrateInput() { vibrate(8); }
function vibrateError() { vibrate([50, 30, 50]); }
function vibrateClear() { vibrate(25); }

const elements = {
  // screen
  gameScreen: document.getElementById("game-screen"),
  problemListScreen: document.getElementById("problem-list-screen"),
  // board
  newButton: document.getElementById("new-button"),
  modeLabel: document.getElementById("mode-label"),
  timer: document.getElementById("timer"),
  timeSpan: document.getElementById("timer-time"),
  board: document.getElementById("board"),
  numberPad: document.getElementById("number-pad"),
  numberButtons: null,
  remainingCounts: null,
  highlightButton: document.getElementById("highlight-button"),
  completeProblemButton: document.getElementById("complete-problem-button"),
  // problem list
  problemList: document.getElementById("problem-list"),
  emptyProblemList: document.getElementById("empty-problem-list"),
  createProblemButton: document.getElementById("create-problem-button"),
  problemListStatus: document.getElementById("problem-list-status"),
  importButton: document.getElementById("import-button"),
  exportButton: document.getElementById("export-button"),
  importDialog: document.getElementById("import-dialog"),
  importOkButton: document.getElementById("import-ok-button"),
  importText: document.getElementById("import-text"),
  importError: document.getElementById("import-error"),
  problemNameDialog: document.getElementById("problem-name-dialog"),
  problemNameInput: document.getElementById("problem-name-input"),
  // clear
  clearOverlay: document.getElementById("clear-overlay"),
  clearTime: document.getElementById("clear-time"),
  clearListButton: document.getElementById("clear-list-button"),
};

initialize();

function initialize() {
  createBoardElements();
  registerEventListeners();
  loadProblems();
  const hasPlayData = loadPlayData();

  if (hasPlayData) {
    renderGame();
    showGameScreen();
    if (state.mode === "play") {
      startTimer();
    } else if (state.mode === "edit") {
      ;
    } else if (state.mode === "list") {
      console.error("error mode: list");
    } else {
      console.error(`error mode: ${state.mode}`);
    }
  } else {
    state.mode = "list";
    renderProblemList();
    showProblemListScreen();
  }

}

function registerEventListeners() {
  initializeNumberPad();
  initializeProblemList();
  initializeButtons();
  setupVisibilityHandlers();
}

function createEmptyBoard() {
  return Array.from(
    { length: BOARD_SIZE },
    () => Array(BOARD_SIZE).fill(0)
  );
}

function createBoardElements() {
  elements.board.innerHTML = "";
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = document.createElement("button");

      cell.className = "cell";
      cell.type = "button";

      cell.dataset.row = row;
      cell.dataset.col = col;

      const number = document.createElement("span");
      number.className = "cell-number";
      cell.numberElement = number;
      cell.appendChild(number);

      if (col === 2 || col === 5) {
        cell.classList.add("block-right");
      }
      if (row === 2 || row === 5) {
        cell.classList.add("block-bottom");
      }

      cell.addEventListener("click", () => {
        handleCellClick(row, col);
      });

      elements.board.appendChild(cell);
    }
  }
}

function selectCell(row, col) {
  state.selectedCell = { row, col };
}

function handleCellClick(row, col) {
  if (state.errorCells.size > 0) {
    state.errorCells.clear();
  }

  const val = state.board[row][col];

  if (val !== 0 && state.selectedNumber !== 0) {
    const isAlreadySelected = state.selectedNumber === val;
    state.selectedNumber = isAlreadySelected ? null : val;
  } else if (state.selectedNumber !== null) {
    if (state.selectedNumber === 0) {
      eraseNumber(row, col);
    } else {
      inputNumber(row, col, state.selectedNumber);
    }
  }

  selectCell(row, col);
  renderGame();
}

function renderGame() {
  renderHeader();
  renderControls();
  renderBoard();
  renderNumberPad();
}

function renderHeader() {
  if (state.mode === "play") {
    elements.modeLabel.textContent = "解答中";
    elements.timer.classList.remove("hidden");
    updateTimerDisplay();
  } else if (state.mode === "edit") {
    elements.modeLabel.textContent = "問題作成中";
    elements.timer.classList.add("hidden");
  } else if (state.mode === "list") {
    // 一覧画面ではヘッダーは使わない、念のため
    elements.modeLabel.textContent = "";
  }
}

function getCellKey(row, col) {
  return `${row}-${col}`;
}

function findDuplicates(row, col, number) {
  if (number === 0) return new Set();

  const duplicates = new Set();

  // 行チェック
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (state.board[row][c] === number) {
      duplicates.add(getCellKey(row, c));
    }
  }
  // 列チェック
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (state.board[r][col] === number) {
      duplicates.add(getCellKey(r, col));
    }
  }
  // ブロックチェック
  const blockRow = Math.floor(row / 3) * 3;
  const blockCol = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const br = blockRow + r;
      const bc = blockCol + c;
      if (state.board[br][bc] === number) {
        duplicates.add(getCellKey(br, bc));
      }
    }
  }

  // 1つだけなら重複ではない（自分自身のみ）
  if (duplicates.size === 1) {
    duplicates.clear();
  }

  return duplicates;
}

function renderBoard() {
  const cells = elements.board.children;

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const index = row * BOARD_SIZE + col;
      const cell = cells[index];
      const value = state.board[row][col];
      const isSelectedCell =
              state.selectedCell?.row === row &&
              state.selectedCell?.col === col;

      cell.numberElement.textContent = value || "";
      cell.classList.remove("selected", "given", "highlight", "error");

      if (state.givenBoard[row][col] !== 0) {
        cell.classList.add("given");
      }

      if (state.highlightEnabled) {
        let highlightNumber = null;

        if (state.selectedNumber > 0) {
          highlightNumber = state.selectedNumber;
        } else if (state.selectedCell) {
          const { row: selRow, col: selCol } = state.selectedCell;
          const selVal = state.board[selRow][selCol];
          highlightNumber = selVal || null;
        }

        if (highlightNumber ===  value) {
          if (!isSelectedCell) {
            cell.classList.add("highlight");
          }
        }
      }

      if (isSelectedCell) {
        cell.classList.add("selected");
      }

      const key = getCellKey(row, col);
      if (state.errorCells.has(key)) {
        cell.classList.add("error");
      }

    }
  }

}

function triggerErrorFeedback() {
  playErrorSound();
  // シェイク
  const cells = elements.board.children;
  state.errorCells.forEach(key => {
    const [r, c] = key.split("-").map(Number);
    const idx = r * BOARD_SIZE + c;
    const cellEl = cells[idx];
    if (cellEl) {
      cellEl.classList.add("shake");
      setTimeout(() => cellEl.classList.remove("shake"), 300);
    }
  });

  vibrateError();
}

function selectNumber(number) {
  if (state.errorCells.size > 0) {
    state.errorCells.clear();
  }

  if (state.selectedNumber === number) {
    state.selectedNumber = null;
  } else {
    state.selectedNumber = number;
  }

  if (state.selectedCell) {
    const { row, col } = state.selectedCell;
    const val = state.board[row][col];
    if (number === 0) {
      eraseNumber(row, col);
    } else if (val === 0 && state.selectedNumber) {
      inputNumber(row, col, state.selectedNumber);
    }
    else {
      state.selectedCell = null;
    }
  }

  renderGame();
}

function isGivenCell(row, col) {
  return state.givenBoard[row][col] !== 0;
}

function inputNumber(row, col, number) {
  if (isGivenCell(row, col)) return; // 固定セルは編集不可

  if (state.board[row][col] === number) {
    return;
  }
  state.board[row][col] = number;

  playInputSound(number);
  vibrateInput();

  if (state.mode === "play") {
    state.errorCells = findDuplicates(row, col, number);
    if (state.errorCells.size > 0) {
      triggerErrorFeedback();
    } else if (state.mode === "play" && isBoardCleared()) {
      handleClear();
      return;
    }
  }

  savePlayData();
}

function eraseNumber(row, col) {
  if (isGivenCell(row, col)) return; // 固定セルは編集不可
  if (state.board[row][col] === 0) {
    return;
  }
  state.board[row][col] = 0;
  playEraseSound();
  state.errorCells.clear();
  savePlayData();
}

function countNumber(number) {
  let count = 0;

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (state.board[row][col] === number) {
        count++;
      }
    }
  }

  return count;
}

function getRemainingCount(number) {
  return Math.max(
    0,
    9 - countNumber(number)
  );
}

function renderNumberPad() {
  elements.numberButtons.forEach((button) => {
    const number = Number(button.dataset.number);
    button.classList.toggle("selected", state.selectedNumber === number);

    if (number === 0) return;

    const remaining = getRemainingCount(number);
    const countEl = elements.remainingCounts[number];
    countEl.textContent = `× ${remaining}`;
    button.classList.toggle("disabled", remaining === 0);
  });
}

function initializeNumberPad() {
  elements.numberButtons = Array.from(
    elements.numberPad.querySelectorAll(".number-button")
  );

  elements.remainingCounts = {};
  elements.numberButtons.forEach(btn => {
    const num = Number(btn.dataset.number);
    if (num !== 0) {
      elements.remainingCounts[num] = btn.querySelector(".remaining-count");
    }
  })

  elements.numberPad.addEventListener("click", (e) => {
    const button = e.target.closest(".number-button");

    if (!button) {
      return;
    }
    const number = Number(button.dataset.number);
    selectNumber(number);
  });
}

///////////////////////////////////////////////////////////////////

function showProblemListScreen() {
  stopTimer();
  state.mode = "list";
  elements.problemListScreen.classList.remove("hidden");
  elements.gameScreen.classList.add("hidden");
}

function showGameScreen() {
  elements.problemListScreen.classList.add("hidden");
  elements.gameScreen.classList.remove("hidden");
}

function startProblemCreation() {
  elements.board.classList.remove("cleared");
  elements.clearOverlay.classList.add("hidden");
  state.mode = "edit";

  state.board = createEmptyBoard();
  state.givenBoard = createEmptyBoard();

  state.selectedCell = null;
  state.selectedNumber = null;

  renderGame();
  showGameScreen();
  savePlayData();
}

function renderControls() {
  elements.completeProblemButton.classList.toggle(
    "hidden",
    state.mode !== "edit"
  );
  if (state.highlightEnabled) {
    elements.highlightButton.textContent = "✦";
    elements.highlightButton.classList.add("active");
  } else {
    elements.highlightButton.textContent = "✧";
    elements.highlightButton.classList.remove("active");
  }
}

function canSaveProblem() {
  return state.board.some(
    (row) => row.some((value) => value !== 0)
  );
}

function completeProblem() {
  if (!canSaveProblem()) {
    return;
  }

  elements.problemNameInput.value = getDefaultProblemName();
  elements.problemNameDialog.showModal();
  elements.problemNameInput.select();
}

function getDefaultProblemName() {
  const number = state.problems.length + 1;
  return `問題 #${number}`;
}

function createProblemId() {
  return crypto.randomUUID();
}

function saveProblem(name) {
  const problem = {
    id: createProblemId(),
    name,
    board: structuredClone(state.board),
    createdAt: Date.now(),
  };

  state.problems.push(problem);
  // 問題作成データは不要になるため破棄
  localStorage.removeItem(STORAGE_KEYS.PLAY_DATA);

  renderProblemList();
  showProblemListScreen();
  saveProblems();
}

function initializeProblemList() {
  elements.problemList.addEventListener(
    "click",
    (e) => {
      const playButton = e.target.closest(".play-problem-button");
      if (playButton) {
        const id = playButton.dataset.id;
        loadProblem(id);
        return;
      }
      const deleteButton = e.target.closest(".delete-problem-button");
      if (deleteButton) {
        const id = deleteButton.dataset.id;
        deleteProblem(id);
      }
    }
  );
}

function renderProblemList() {
  setProblemListStatus("");
  elements.problemList.innerHTML = "";

  if (state.problems.length === 0) {
    elements.problemList.append(elements.emptyProblemList);
    elements.emptyProblemList.classList.remove("hidden");
    return;
  }
  elements.emptyProblemList.classList.add("hidden");

  for (const problem of state.problems) {
    const item = document.createElement("div");
    item.className = "problem-item";

    const now = new Date(problem.createdAt);
    const date =
      `${now.getFullYear()}-` +
      `${String(now.getMonth() + 1).padStart(2, "0")}-` +
      `${String(now.getDate()).padStart(2, "0")}`;
    const time =
      `${String(now.getHours()).padStart(2, "0")} : ` +
      `${String(now.getMinutes()).padStart(2, "0")}`;

    item.innerHTML = `
      <div class="problem-name">
        <div class="problem-title">${problem.name}</div>
        <div class="problem-date">${date} ${time}</div>
      </div>

      <button
        class="play-problem-button"
        data-id="${problem.id}"
      >
        ▶
      </button>

      <button
        class="delete-problem-button"
        data-id="${problem.id}"
      >
        🗑
      </button>
    `;

    elements.problemList.append(item);
  }
}

function initializeButtons() {
  elements.importButton.addEventListener("click", openImportDialog);
  elements.exportButton.addEventListener("click", exportProblems);
  elements.createProblemButton.addEventListener("click", startProblemCreation);
  elements.completeProblemButton.addEventListener("click", completeProblem);

  elements.newButton.addEventListener(
    "click", () => {
      localStorage.removeItem(STORAGE_KEYS.PLAY_DATA);
      state.mode = "list";
      renderProblemList();
      showProblemListScreen();
  });

  elements.highlightButton.addEventListener(
    "click", () => {
    state.highlightEnabled = !state.highlightEnabled;
    renderGame();
  });

  elements.clearListButton.addEventListener(
    "click", () => {
      elements.clearOverlay.classList.add("hidden");
      state.mode = "list";
      renderProblemList();
      showProblemListScreen();
  });

  elements.problemNameDialog.addEventListener("close",
    () => {
      if (elements.problemNameDialog.returnValue !== "default") {
        return;
      }
      const name =
        elements.problemNameInput.value.trim()
        || getDefaultProblemName();

      saveProblem(name);
    }
  );

  elements.importText.addEventListener("input", () => {
    elements.importError.classList.add("hidden");
  });

  elements.importOkButton.addEventListener("click",
    (e) => {
      e.preventDefault();
      if (importProblems(elements.importText.value)) {
        elements.importText.value = "";
        elements.importDialog.close();
      }
    }
  );
}

function openImportDialog() {
  elements.importText.value = "";
  elements.importError.textContent = "";
  elements.importError.classList.add("hidden");
  elements.importDialog.showModal();
}

async function exportProblems() {
  const json = formatExportJson(state.problems);

  try {
    await navigator.clipboard.writeText(json);
    const count = state.problems.length;
    setProblemListStatus(`${count}件の問題をコピーしました。`);
  } catch {
    setProblemListStatus("問題データをコピーできませんでした。");
  }
}

function formatExportJson(problems) {
  let json = JSON.stringify(problems, null, 2);

  // board の各行だけを 1 行に戻す
  json = json.replace(
    /\[\n((?:\s+\d,?\n?)+?)\s+\]/g,
    (_, body) => {
      const numbers = body
        .trim()
        .split(/\s*,?\n\s*/)
        .filter(Boolean);

      return `[${numbers.join(",")}]`;
    }
  );

  return json + "\n";
}

function importProblems(text) {
  const result = validateProblems(text);
  if (!result.ok) {
    elements.importError.textContent = result.message;
    elements.importError.classList.remove("hidden");
    setProblemListStatus("");
    return false;
  }
  const existingIds = new Set(state.problems.map(problem => problem.id));
  const imported = result.problems.filter(
      problem => !existingIds.has(problem.id)
    );
  state.problems.push(...imported);

  saveProblems();
  renderProblemList();

  const skipped = result.problems.length - imported.length;
  let msg = `${imported.length}件の問題を読み込みました。`;
  if (skipped > 0) {
    msg += `（${skipped}件は重複のためスキップしました。）`;
  }
  setProblemListStatus(msg);

  return true;
}

function validateProblems(text) {
  let problems;
  if (!text.trim()) {
      return {ok:false, message:"問題データを入力してください。"};
  }
  try {
    problems = JSON.parse(text);
  } catch {
    return {ok: false, message: "JSONの形式が正しくありません。" };
  }
  if (!Array.isArray(problems)) {
    return {ok: false, message: "問題データではありません。" };
  }
  for (const problem of problems) {
    const result = validateProblem(problem);
    if (!result.ok) {
      return result;
    }
  }
  return {ok: true, problems};
}

function validateProblem(problem) {

  if (typeof problem.id !== "string" || problem.id.trim() === "") {
    return {ok: false, message: "id が正しくありません。"};
  }
  if (typeof problem.name !== "string") {
    return {ok: false, message: "問題名が正しくありません。"};
  }
  if (!Number.isFinite(problem.createdAt)) {
  return {ok: false, message: "createdAt が正しくありません。"};
  }
  if (!Array.isArray(problem.board)) {
    return {ok: false, message: "board の形式が正しくありません。"};
  }
  if (problem.board.length !== 9) {
    return {ok: false, message: "盤面は9行必要です。"};
  }
  for (let row = 0; row < 9; row++) {
    if (!Array.isArray(problem.board[row]) || problem.board[row].length !== 9) {
      return {ok: false, message: `${row + 1}行目は9列必要です。`};
    }
    for (let col = 0; col < 9; col++) {
      const value = problem.board[row][col];
      if (!Number.isInteger(value) || value < 0 || value > 9) {
        return {ok: false, message: `${row + 1}行${col + 1}列の値が不正です。`};
      }
    }
  }
  return {ok: true};

}

function setProblemListStatus(message = "") {
  elements.problemListStatus.textContent = message;
}

function deleteProblem(id) {
  state.problems =
    state.problems.filter(
      (problem) => problem.id !== id
    );

  renderProblemList();
  saveProblems();
}

function loadProblem(id) {
  const problem = state.problems.find(p => p.id === id);
  if (!problem) return;

  elements.board.classList.remove("cleared");
  elements.clearOverlay.classList.add("hidden");
  
  state.mode = "play";
  state.board = structuredClone(problem.board);
  state.givenBoard = structuredClone(problem.board);

  state.selectedCell = null;
  state.selectedNumber = null;
  state.elapsedSeconds = 0;
  state.sessionStartTime = null;

  renderGame();

  elements.board.classList.remove("enter");
  void elements.board.offsetWidth;
  elements.board.classList.add("enter");

  showGameScreen();
  savePlayData();

  playStartSound();
  setTimeout(() => {
    startTimer();
  }, 220);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes
      .toString()
      .padStart(2, "0")}:${seconds
                    .toString()
                    .padStart(2, "0")}`;
}

function updateTimerDisplay() {
  if (!elements.timer) return;
  if (!elements.timeSpan) return;

  const totalSeconds = state.elapsedSeconds;
  elements.timeSpan.textContent = formatTime(totalSeconds);
}

function startTimer() {
  if (state.mode !== 'play' || state.timerInterval) return;

  // 再開時は既存のelapsedSecondsを保持
  state.sessionStartTime = Date.now() - (state.elapsedSeconds * 1000);

  state.timerInterval = setInterval(() => {
    if (!state.sessionStartTime) return;
    state.elapsedSeconds = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    updateTimerDisplay();
  }, 1000);

  elements.timer.classList.remove('hidden');
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  state.sessionStartTime = null;
}

function setupVisibilityHandlers() {
  // タブ切り替え
  document.addEventListener('visibilitychange', () => {
    if (state.mode !== 'play') return;
    if (document.hidden) {
      pauseGame();
    } else {
      startTimer();
    }
  });
  // pagehide（アプリ終了・バックグラウンド遷移）
  window.addEventListener('pagehide', pauseGame);
}

function pauseGame() {
  if (state.mode !== "play" || !state.sessionStartTime) {
    return;
  }
  state.elapsedSeconds =
    Math.floor((Date.now() - state.sessionStartTime) / 1000);

  stopTimer();
  savePlayData();
}

function savePlayData() {
  if (state.mode === "list") {
    localStorage.removeItem(STORAGE_KEYS.PLAY_DATA); // 一覧画面ではプレイデータ不要
    return;
  }

  try {
    const playData = {
      mode: state.mode,
      board: state.board,
      givenBoard: state.givenBoard,
      elapsedSeconds: state.elapsedSeconds,
      highlightEnabled: state.highlightEnabled,
      // タイマー関連は復元時に再計算するため保存不要
    };
    localStorage.setItem(STORAGE_KEYS.PLAY_DATA, JSON.stringify(playData));
  } catch (e) {
    console.warn("プレイデータ保存失敗:", e);
  }
}

function loadPlayData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PLAY_DATA);
    if (!saved) return false;

    const data = JSON.parse(saved);

    // 復元
    state.mode = data.mode || "edit";
    state.board = data.board || createEmptyBoard();
    state.givenBoard = data.givenBoard || createEmptyBoard();
    state.elapsedSeconds = data.elapsedSeconds || 0;
    state.highlightEnabled = data.highlightEnabled !== undefined ? data.highlightEnabled : true;

    // 選択状態はリセット
    state.selectedCell = null;
    state.selectedNumber = null;

    return true;
  } catch (e) {
    console.warn("プレイデータ読み込み失敗:", e);
    // 破損時はクリア
    localStorage.removeItem(STORAGE_KEYS.PLAY_DATA);
    return false;
  }
}

function saveProblems() {
  try {
    localStorage.setItem(STORAGE_KEYS.PROBLEMS, JSON.stringify(state.problems));
  } catch (e) {
    console.warn("問題データ保存失敗:", e);
  }
}

function loadProblems() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.PROBLEMS);
    if (saved) {
      state.problems = JSON.parse(saved);
    }
  } catch (e) {
    console.warn("問題データ読み込み失敗:", e);
    state.problems = [];
    localStorage.removeItem(STORAGE_KEYS.PROBLEMS);
  }
}

function isValidGroup(values) {
  const sorted = [...values].sort();
  return sorted.join(",") === "1,2,3,4,5,6,7,8,9";
}

function isBoardCleared() {
  // 行
  for (let row = 0; row < BOARD_SIZE; row++) {
    if (!isValidGroup(state.board[row])) {
      return false;
    }
  }

  // 列
  for (let col = 0; col < BOARD_SIZE; col++) {
    const values = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      values.push(state.board[row][col]);
    }

    if (!isValidGroup(values)) {
      return false;
    }
  }

  // ブロック
  for (let blockRow = 0; blockRow < 3; blockRow++) {
    for (let blockCol = 0; blockCol < 3; blockCol++) {

      const values = [];

      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          values.push(
            state.board[blockRow * 3 + r][blockCol * 3 + c]
          );
        }
      }

      if (!isValidGroup(values)) {
        return false;
      }
    }
  }

  return true;
}

function handleClear() {
  stopTimer();
  localStorage.removeItem(STORAGE_KEYS.PLAY_DATA);
  elements.board.classList.add("cleared");

  playClearSound();
  vibrateClear();

  setTimeout(() => {
    elements.clearTime.textContent =
      formatTime(state.elapsedSeconds);
    elements.clearOverlay.classList.remove("hidden");
  }, 650);
}

function playClearSound() {
  sound.play(523, 0.12, "triangle", 0.12);
  sound.play(659, 0.12, "triangle", 0.12);
  sound.play(784, 0.3, "triangle", 0.18);
}

function playErrorSound() {
  sound.play(180, 0.09, "square", 0.10);
  sound.play(140, 0.15, "square", 0.08);
}

function playInputSound(number) {
  const freq = [
    0,
    660, 680, 700,
    720, 740, 760,
    780, 800, 820,
  ];

  sound.playSynth({
    type: "triangle",
    freqStart: freq[number],
    freqEnd: freq[number] * 1.03,
    duration: 0.045,
    volume: 0.07,
    attackTime: 0.003,
  });
}

function playEraseSound() {
  sound.playSynth({
    type: "sine",
    freqStart: 520,
    freqEnd: 420,
    duration: 0.05,
    volume: 0.06,
    attackTime: 0.003,
  });
}

function playStartSound() {
  sound.playSynth({
    type: "triangle",
    freqStart: 392,   // G4
    freqEnd: 392,
    duration: 0.18,
    volume: 0.05,
    attackTime: 0.01,
  });

  sound.playSynth({
    type: "triangle",
    freqStart: 523,   // C5
    freqEnd: 523,
    duration: 0.28,
    volume: 0.06,
    attackTime: 0.01,
  }, 0.12);
}

