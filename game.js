'use strict';

// 스도쿠: 화면·입력·흐름. 판 규칙은 logic.js (LOGIC) 에 있다.
(() => {
const L = LOGIC;

// ---------- 모양 ----------
const W = 400;
const CELL = 40, BX = 20, BY = 68, BS = CELL * 9;          // 판 왼쪽 위와 한 변
// 숫자 버튼: 폰에서 옆 숫자를 잘못 누르지 않게 판보다 넓게(양옆 6) 쓰고 키를 키운다 (폰 폭 375px 에서 한 칸 약 38px)
const PAD_X0 = 6, PAD_GAP = 3, PAD_W = (W - PAD_X0 * 2 - PAD_GAP * 8) / 9, PAD_H = 64;
const PAD_Y = BY + BS + 16;
const TOOL_Y = PAD_Y + PAD_H + 14, TOOL_H = 46, TOOL_W = 112, TOOL_GAP = 12;
const H = TOOL_Y + TOOL_H + 14;
const INK = '#2b1d52';
const FONT = '"Jua", "Apple SD Gothic Neo", sans-serif';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

const MAX_MISTAKES = 3, HINTS = 3;
const SAVE_KEY = 'sudokuSave';

const padX = (v) => PAD_X0 + (v - 1) * (PAD_W + PAD_GAP);
const toolX = (k) => BX + k * (TOOL_W + TOOL_GAP);
const TOOLS = ['erase', 'notes', 'hint'];

// ---------- 캔버스 ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);

function fit() {
  const hudH = 62;
  const scale = Math.min((innerWidth - 24) / W, (innerHeight - 28 - hudH) / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  $('col').style.width = Math.max(cssW, Math.min(innerWidth - 20, 340)) + 'px';
  $('wrap').style.width = cssW + 'px';
  $('wrap').style.margin = '0 auto';
}
addEventListener('resize', fit);

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// ---------- 저장·소리 ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};
let muted = store.get('sudokuMuted') === '1';
let audio = null;
function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch (_) {}
}
const sfx = {
  pick: () => tone(700, 0.03, 'triangle', 0.05),
  put: () => tone(520, 0.07, 'sine', 0.1, 200),
  note: () => tone(880, 0.03, 'triangle', 0.05),
  wrong: () => tone(160, 0.2, 'square', 0.07, -60),
  erase: () => tone(300, 0.05, 'triangle', 0.06, -80),
  hint: () => [660, 880].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'sine', 0.09), i * 70)),
  unit: () => [784, 988, 1175].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'triangle', 0.09), i * 70)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.1), i * 100)),
  end: () => [784, 659, 523, 392].forEach((f, i) => setTimeout(() => tone(f, 0.2, 'triangle', 0.1), i * 140)),
};

// ---------- 상태 ----------
let state = 'menu';           // menu | play | paused | won | lost
let level = store.get('sudokuLevel') || 'normal';
let puzzle = new Array(81).fill(0), solution = new Array(81).fill(0);
let cells = new Array(81).fill(0);       // 지금 판 (준 숫자 + 내가 적은 숫자)
let notes = new Array(81).fill(0);       // 칸마다 메모 비트마스크
let sel = -1, notesMode = false;
let mistakes = 0, hintsLeft = HINTS, hintsUsed = 0, time = 0;
let doneUnits = new Set();               // 이미 다 채운 줄·열·박스 ('r3' 'c0' 'b4')
let flashes = [], shakes = new Map(), particles = [], texts = [];
let best = Number(store.get('sudokuBest')) || 0;
let clock = 0, saveT = 0;

const correct = (i) => cells[i] === solution[i];
const given = (i) => puzzle[i] !== 0;
const locked = (i) => given(i) || (cells[i] && correct(i));      // 맞게 채운 칸은 못 바꾼다

function unitCells(kind, k) {
  const out = [];
  for (let i = 0; i < 81; i++) {
    if ((kind === 'r' && L.rowOf(i) === k) || (kind === 'c' && L.colOf(i) === k) || (kind === 'b' && L.boxOf(i) === k)) out.push(i);
  }
  return out;
}

function newGame(lv, same = false) {
  level = lv; store.set('sudokuLevel', lv);
  if (!same) {
    const p = L.generate(lv);
    puzzle = p.puzzle; solution = p.solution;
  }
  cells = puzzle.slice(); notes = new Array(81).fill(0);
  sel = puzzle.findIndex((v) => !v); notesMode = false;
  mistakes = 0; hintsLeft = HINTS; hintsUsed = 0; time = 0;
  doneUnits = new Set(); flashes = []; shakes.clear(); particles = []; texts = [];
  for (const kind of ['r', 'c', 'b']) for (let k = 0; k < 9; k++) if (unitCells(kind, k).every(correct)) doneUnits.add(kind + k);
  state = 'play';
  hideOverlay();
  save();
  updateHud();
}

// ---------- 이어하기 ----------
function save() {
  if (state !== 'play' && state !== 'paused') return;
  store.set(SAVE_KEY, JSON.stringify({ level, puzzle, solution, cells, notes, mistakes, hintsLeft, hintsUsed, time }));
}
function loadSave() {
  try {
    const s = JSON.parse(store.get(SAVE_KEY));
    if (!s || s.puzzle.length !== 81 || s.solution.length !== 81 || s.cells.length !== 81) return null;
    return s;
  } catch (_) { return null; }
}
function resumeSave(s) {
  level = s.level; puzzle = s.puzzle; solution = s.solution; cells = s.cells; notes = s.notes;
  mistakes = s.mistakes; hintsLeft = s.hintsLeft; hintsUsed = s.hintsUsed; time = s.time;
  sel = cells.findIndex((v, i) => !locked(i)); notesMode = false;
  doneUnits = new Set(); flashes = []; shakes.clear(); particles = []; texts = [];
  for (const kind of ['r', 'c', 'b']) for (let k = 0; k < 9; k++) if (unitCells(kind, k).every(correct)) doneUnits.add(kind + k);
  state = 'play';
  hideOverlay();
  updateHud();
}

// ---------- 흐름 ----------
function select(i) {
  if (state !== 'play' || i === sel) return;
  sel = i;
  sfx.pick();
}

function removeNote(i, v) {
  for (const j of L.PEERS[i]) notes[j] &= ~(1 << (v - 1));
}

function put(v) {
  if (state !== 'play' || sel < 0 || locked(sel)) return;
  const i = sel;
  if (notesMode) {
    if (cells[i]) return;                               // 숫자가 있는 칸엔 메모 못 적는다
    notes[i] ^= 1 << (v - 1);
    sfx.note();
    return;
  }
  if (cells[i] === v) return;
  cells[i] = v;
  notes[i] = 0;
  if (v === solution[i]) {
    removeNote(i, v);
    sfx.put();
    burst(BX + (L.colOf(i) + 0.5) * CELL, BY + (L.rowOf(i) + 0.5) * CELL, '#7ee39a');
    checkUnits(i);
    if (cells.every((x, k) => x === solution[k])) return win();
  } else {
    mistakes++;
    shakes.set(i, 0.35);
    sfx.wrong();
    texts.push({ text: '❌', x: BX + (L.colOf(i) + 0.5) * CELL, y: BY + L.rowOf(i) * CELL, t: 0 });
    if (mistakes >= MAX_MISTAKES) return lose();
  }
  save();
  updateHud();
}

function erase() {
  if (state !== 'play' || sel < 0 || locked(sel)) return;
  if (cells[sel]) { cells[sel] = 0; sfx.erase(); }
  else if (notes[sel]) { notes[sel] = 0; sfx.erase(); }
  save();
}

// 줄·열·박스가 다 맞게 차면 반짝
function checkUnits(i) {
  for (const key of ['r' + L.rowOf(i), 'c' + L.colOf(i), 'b' + L.boxOf(i)]) {
    if (doneUnits.has(key)) continue;
    const list = unitCells(key[0], Number(key.slice(1)));
    if (list.every(correct)) { doneUnits.add(key); flashes.push({ cells: list, t: 0 }); sfx.unit(); }
  }
}

function hint() {
  if (state !== 'play' || hintsLeft <= 0) return;
  // 고른 칸이 비었거나 틀렸으면 거기, 아니면 처음 비어 있는(또는 틀린) 칸
  let i = sel >= 0 && !locked(sel) ? sel : cells.findIndex((v, k) => v !== solution[k]);
  if (i < 0) return;
  sel = i;
  hintsLeft--; hintsUsed++;
  cells[i] = solution[i]; notes[i] = 0;
  removeNote(i, solution[i]);
  sfx.hint();
  burst(BX + (L.colOf(i) + 0.5) * CELL, BY + (L.rowOf(i) + 0.5) * CELL, '#ffd23f');
  checkUnits(i);
  if (cells.every((x, k) => x === solution[k])) return win();
  save();
  updateHud();
}

function burst(x, y, col) {
  for (let n = 0; n < 7; n++) {
    const a = Math.random() * Math.PI * 2, s = 50 + Math.random() * 100;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5, col });
  }
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function win() {
  state = 'won';
  store.del(SAVE_KEY);
  const sc = L.score(level, time, mistakes, hintsUsed);
  const isBest = sc > best;
  if (isBest) { best = sc; store.set('sudokuBest', String(best)); }
  sfx.win();
  updateHud();
  setTimeout(() => showOverlay(`
    <h2 class="inked">완성!</h2>
    <div class="big inked">${sc.toLocaleString()}</div>
    <span class="tag">${isBest ? '🏆 최고 기록!' : `최고 기록 ${best.toLocaleString()}`}</span>
    <div class="card"><dl class="stats">
      <dt>난이도</dt><dd>${L.LEVELS[level].name}</dd>
      <dt>걸린 시간</dt><dd>${fmt(time)}</dd>
      <dt>실수</dt><dd>${mistakes}번</dd>
      <dt>힌트</dt><dd>${hintsUsed}번</dd>
    </dl></div>
    <button data-act="again">한 번 더</button>
    <button class="sub" data-act="menu">← 처음으로</button>`), 800);
}

function lose() {
  state = 'lost';
  store.del(SAVE_KEY);
  sfx.end();
  updateHud();
  setTimeout(() => showOverlay(`
    <h2 class="inked">실수 ${MAX_MISTAKES}번!</h2>
    <span class="tag">${L.LEVELS[level].name} · ${fmt(time)}</span>
    <div class="card" style="text-align:center">다 채운 칸 ${cells.filter((v, i) => v && v === solution[i]).length - puzzle.filter(Boolean).length}개<br>남은 칸 ${cells.filter((v, i) => v !== solution[i]).length}개</div>
    <button data-act="same">같은 문제 다시</button>
    <button class="sub" data-act="menu">← 처음으로</button>`), 700);
}

function update(dt) {
  clock += dt;
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; }
  particles = particles.filter((p) => p.life > 0);
  for (const t of texts) { t.t += dt; t.y -= 30 * dt; }
  texts = texts.filter((t) => t.t < 0.7);
  for (const f of flashes) f.t += dt;
  flashes = flashes.filter((f) => f.t < 0.6);
  for (const [i, t] of shakes) { if (t - dt <= 0) shakes.delete(i); else shakes.set(i, t - dt); }
  if (state !== 'play') return;
  time += dt;
  saveT += dt;
  if (saveT > 5) { saveT = 0; save(); }
  updateHud();
}

// ---------- 그리기 ----------
function label(text, x, y, size, fill = '#fff', align = 'center') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.2); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function plain(text, x, y, size, fill, align = 'center') {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
function panel(x, y, w, h, r, fill, lift = 4) {
  ctx.fillStyle = INK; roundRect(ctx, x, y + lift, w, h, r); ctx.fill();
  ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; roundRect(ctx, x, y, w, h, r); ctx.stroke();
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // 위 줄: 하트(남은 실수 기회) · 난이도 · 남은 칸
  for (let k = 0; k < MAX_MISTAKES; k++) {
    ctx.font = `26px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
    ctx.globalAlpha = k < MAX_MISTAKES - mistakes ? 1 : 0.35;
    ctx.fillText(k < MAX_MISTAKES - mistakes ? '❤️' : '🖤', BX + 16 + k * 34, 30);
    ctx.globalAlpha = 1;
  }
  panel(W / 2 - 40, 14, 80, 32, 16, '#ffd23f', 3);
  plain(L.LEVELS[level].name, W / 2, 31, 18, INK);
  label(`남은 칸 ${cells.filter((v, i) => v !== solution[i]).length}`, W - BX, 30, 17, '#fff', 'right');

  // 판
  ctx.fillStyle = INK; roundRect(ctx, BX - 5, BY - 5 + 6, BS + 10, BS + 10, 14); ctx.fill();
  ctx.fillStyle = '#fffaf0'; roundRect(ctx, BX - 5, BY - 5, BS + 10, BS + 10, 14); ctx.fill();

  const selV = sel >= 0 ? cells[sel] : 0;
  for (let i = 0; i < 81; i++) {
    const r = L.rowOf(i), c = L.colOf(i);
    let x = BX + c * CELL, y = BY + r * CELL;
    const bad = cells[i] && !correct(i) && !given(i);
    let bg = null;
    if (sel >= 0 && i !== sel && (r === L.rowOf(sel) || c === L.colOf(sel) || L.boxOf(i) === L.boxOf(sel))) bg = '#efe9ff';
    if (selV && cells[i] === selV && correct(i)) bg = '#ffe9a8';
    if (bad) bg = '#ffd0d8';
    if (i === sel) bg = '#ffd23f';
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, CELL, CELL); }
    const sh = shakes.get(i);
    if (sh) x += Math.sin(sh * 70) * 3;
    if (cells[i]) {
      const col = given(i) ? INK : bad ? '#ff3b5c' : '#3f6fff';
      plain(String(cells[i]), x + CELL / 2, y + CELL / 2 + 2, given(i) ? 27 : 26, col);
    } else if (notes[i]) {
      for (let v = 1; v <= 9; v++) {
        if (!(notes[i] & (1 << (v - 1)))) continue;
        const nx = x + 7 + ((v - 1) % 3) * 13, ny = y + 8 + (((v - 1) / 3) | 0) * 12;
        plain(String(v), nx + 3, ny + 3, 11, v === selV ? '#ff5fa2' : '#6b5c95');
      }
    }
  }
  // 칸 선, 3×3 굵은 선
  ctx.strokeStyle = 'rgba(43,29,82,.28)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k < 9; k++) {
    if (k % 3 === 0) continue;
    ctx.moveTo(BX + k * CELL, BY); ctx.lineTo(BX + k * CELL, BY + BS);
    ctx.moveTo(BX, BY + k * CELL); ctx.lineTo(BX + BS, BY + k * CELL);
  }
  ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath();
  for (let k = 0; k <= 3; k++) {
    ctx.moveTo(BX + k * CELL * 3, BY); ctx.lineTo(BX + k * CELL * 3, BY + BS);
    ctx.moveTo(BX, BY + k * CELL * 3); ctx.lineTo(BX + BS, BY + k * CELL * 3);
  }
  ctx.stroke();

  // 다 채운 줄·열·박스 반짝
  for (const f of flashes) {
    ctx.fillStyle = `rgba(255,210,63,${0.65 * (1 - f.t / 0.6)})`;
    for (const i of f.cells) ctx.fillRect(BX + L.colOf(i) * CELL, BY + L.rowOf(i) * CELL, CELL, CELL);
  }

  // 숫자 버튼 1~9: 남은 개수, 다 놓은 숫자는 흐리게
  for (let v = 1; v <= 9; v++) {
    const left = 9 - cells.filter((x, i) => x === v && correct(i)).length;
    const active = selV === v && correct(sel);
    ctx.globalAlpha = left > 0 ? 1 : 0.35;
    panel(padX(v), PAD_Y, PAD_W, PAD_H, 12, active ? '#ffd23f' : '#ffffff', 4);
    plain(String(v), padX(v) + PAD_W / 2, PAD_Y + 28, 29, notesMode ? '#ff5fa2' : INK);
    if (left > 0) plain(String(left), padX(v) + PAD_W / 2, PAD_Y + PAD_H - 10, 12, '#6b5c95');
    ctx.globalAlpha = 1;
  }
  // 도구 버튼
  const tools = [
    { t: '⌫ 지우기', on: true },
    { t: notesMode ? '✏️ 메모 ON' : '✏️ 메모', on: true, hot: notesMode },
    { t: `💡 힌트 ${hintsLeft}`, on: hintsLeft > 0 },
  ];
  tools.forEach((b, k) => {
    ctx.globalAlpha = b.on ? 1 : 0.5;
    panel(toolX(k), TOOL_Y, TOOL_W, TOOL_H, 23, b.hot ? '#ff9ecb' : '#ffd23f', 5);
    label(b.t, toolX(k) + TOOL_W / 2, TOOL_Y + TOOL_H / 2 + 1, 18, '#fff');
    ctx.globalAlpha = 1;
  });

  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 3);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(p.x, p.y + 1, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const t of texts) {
    ctx.globalAlpha = Math.min(1, (0.7 - t.t) * 3);
    ctx.font = `22px ${EMOJI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#000';
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function updateHud() {
  $('time').textContent = fmt(time);
  $('best').textContent = best.toLocaleString();
}

// ---------- 루프 ----------
let last = performance.now();
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  if (state !== 'paused') update(dt);
  draw();
  requestAnimationFrame(frame);
}

// ---------- 오버레이 ----------
function showOverlay(html) { const o = $('overlay'); o.innerHTML = html; o.classList.remove('hidden'); }
function hideOverlay() { $('overlay').classList.add('hidden'); }

function showMenu() {
  state = 'menu';
  const s = loadSave();
  showOverlay(`
    <h1>스도<span class="p">쿠</span></h1>
    <p>빈칸에 <b>1~9</b>를 채워요<br>줄·세로줄·3×3 칸마다 숫자가 한 번씩만!</p>
    ${s ? `<button data-act="resume">이어하기 <small>${L.LEVELS[s.level].name} · ${fmt(s.time)}</small></button>` : ''}
    <div class="lvrow">
      ${Object.entries(L.LEVELS).map(([k, v]) => `<button class="lv" data-level="${k}" style="background:${{ easy: '#7ee39a', normal: '#ffd23f', hard: '#ff9ecb' }[k]}">${v.name} <small>힌트 ${v.clues}개</small></button>`).join('')}
    </div>
    <div class="card">
      👆 칸을 누르고 아래 숫자를 눌러요<br>
      ❤️ 틀린 숫자는 ${MAX_MISTAKES}번까지만 봐줘요<br>
      ✏️ 메모로 후보 숫자를 적어 둘 수 있어요<br>
      💡 힌트는 한 판에 ${HINTS}번 (점수가 깎여요)
    </div>`);
}

$('overlay').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.level) return newGame(btn.dataset.level);
  const act = btn.dataset.act;
  if (act === 'again') newGame(level);
  else if (act === 'same') newGame(level, true);
  else if (act === 'menu') showMenu();
  else if (act === 'resume') { const s = loadSave(); if (s) resumeSave(s); }
  else if (act === 'continue') resume();
});
function pause() {
  if (state !== 'play') return;
  save();
  state = 'paused';
  showOverlay(`<h2 class="inked">일시정지</h2><button data-act="continue">계속하기</button>
    <button class="sub" data-act="menu">← 그만하기</button>`);
}
function resume() { if (state !== 'paused') return; state = 'play'; hideOverlay(); }

// ---------- 입력 ----------
// 누르는 순간 바로 반응한다 (떼기를 기다리지 않아서 아이폰에서 탭이 씹히지 않는다)
function toLogical(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) * (W / rect.width), y: (e.clientY - rect.top) * (H / rect.height) };
}
canvas.addEventListener('pointerdown', (e) => {
  if (state !== 'play') return;
  const p = toLogical(e);
  if (p.x >= BX && p.x < BX + BS && p.y >= BY && p.y < BY + BS) {
    return select(Math.floor((p.y - BY) / CELL) * 9 + Math.floor((p.x - BX) / CELL));
  }
  if (p.y >= PAD_Y - 4 && p.y <= PAD_Y + PAD_H + 8) {
    // 버튼 사이 틈도 가까운 버튼으로 받는다 (손가락이 틈에 떨어져도 씹히지 않게)
    const v = Math.floor((p.x - PAD_X0 + PAD_GAP / 2) / (PAD_W + PAD_GAP)) + 1;
    if (v >= 1 && v <= 9 && 9 - cells.filter((x, i) => x === v && correct(i)).length > 0) put(v);
    return;
  }
  if (p.y >= TOOL_Y && p.y <= TOOL_Y + TOOL_H + 6) {
    const k = Math.floor((p.x - BX) / (TOOL_W + TOOL_GAP));
    if (k < 0 || k > 2 || p.x > toolX(k) + TOOL_W) return;
    if (TOOLS[k] === 'erase') erase();
    else if (TOOLS[k] === 'notes') { notesMode = !notesMode; sfx.pick(); }
    else hint();
  }
});
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { state === 'paused' ? resume() : pause(); return; }
  if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
  if (state !== 'play') return;
  if (e.key >= '1' && e.key <= '9') { put(Number(e.key)); return; }
  if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); erase(); return; }
  if (e.key === 'n' || e.key === 'N') { notesMode = !notesMode; return; }
  if (e.key === 'h' || e.key === 'H') { hint(); return; }
  const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
  if (move !== undefined) {
    e.preventDefault();
    const cur = sel < 0 ? 0 : sel, r = L.rowOf(cur) + (move === -9 ? -1 : move === 9 ? 1 : 0), c = L.colOf(cur) + (move === -1 ? -1 : move === 1 ? 1 : 0);
    if (r >= 0 && r < 9 && c >= 0 && c < 9) select(r * 9 + c);
  }
});
addEventListener('blur', pause);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function toggleMute() {
  muted = !muted;
  store.set('sudokuMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); state === 'paused' ? resume() : pause(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

// 첫 화면 뒤에 흐릿하게 보일 예시 판
{ const p = L.generate('easy'); puzzle = p.puzzle; solution = p.solution; cells = puzzle.slice(); }
updateHud();
showMenu();
fit();
requestAnimationFrame(frame);

/* @test-hooks:start */
// 테스트용
window.__sd = { get state() { return state; }, get cells() { return cells; }, get solution() { return solution; }, get puzzle() { return puzzle; },
  get notes() { return notes; }, get mistakes() { return mistakes; }, get hintsLeft() { return hintsLeft; }, get sel() { return sel; }, get level() { return level; },
  get notesMode() { return notesMode; }, set notesMode(v) { notesMode = v; }, get time() { return time; }, get flashes() { return flashes; },
  newGame, select, put, erase, hint, update, draw, showMenu, resumeSave, loadSave, pause, resume, W, H, BX, BY, CELL, PAD_X0, PAD_Y, PAD_W, PAD_GAP, PAD_H, TOOL_Y, TOOL_H, TOOL_W, TOOL_GAP };
/* @test-hooks:end */
})();
