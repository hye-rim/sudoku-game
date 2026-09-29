'use strict';

// 스도쿠: 규칙만 모아 둔 파일 (그리기·입력 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// 판은 길이 81 배열(왼쪽 위부터 가로로), 0 은 빈칸. 칸 번호 i → 줄 r = i / 9, 열 c = i % 9.
const N = 9;
const ALL = 0x1ff;                                    // 숫자 1~9 가 모두 켜진 비트마스크
const rowOf = (i) => (i / 9) | 0;
const colOf = (i) => i % 9;
const boxOf = (i) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);
const bit = (v) => 1 << (v - 1);

// 한 칸과 같은 줄·열·3×3 칸에 있는 칸들 (자기 자신 제외)
const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  for (let j = 0; j < 81; j++) {
    if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) s.add(j);
  }
  return [...s];
});

function shuffled(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// 비트마스크로 줄·열·박스에 쓰인 숫자를 기억하며 푸는 풀이기. 가능한 후보가 가장 적은 칸부터 채운다.
// 정답을 limit 개까지 세고, 처음 찾은 정답을 돌려준다.
function solve(grid, limit = 2, rng = null) {
  const g = grid.slice();
  const row = new Array(9).fill(0), col = new Array(9).fill(0), box = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    if (!g[i]) continue;
    const b = bit(g[i]);
    if ((row[rowOf(i)] | col[colOf(i)] | box[boxOf(i)]) & b) return { count: 0, solution: null };   // 이미 어긋난 판
    row[rowOf(i)] |= b; col[colOf(i)] |= b; box[boxOf(i)] |= b;
  }
  let count = 0, first = null;
  const rec = () => {
    let best = -1, bestMask = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = ALL & ~(row[rowOf(i)] | col[colOf(i)] | box[boxOf(i)]);
      let n = 0; for (let m = mask; m; m &= m - 1) n++;
      if (n < bestN) { best = i; bestMask = mask; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) { count++; if (!first) first = g.slice(); return count >= limit; }
    if (bestN === 0) return false;
    const vals = [];
    for (let v = 1; v <= 9; v++) if (bestMask & bit(v)) vals.push(v);
    if (rng) shuffled(vals, rng);
    for (const v of vals) {
      const b = bit(v), r = rowOf(best), c = colOf(best), x = boxOf(best);
      g[best] = v; row[r] |= b; col[c] |= b; box[x] |= b;
      const stop = rec();
      g[best] = 0; row[r] &= ~b; col[c] &= ~b; box[x] &= ~b;
      if (stop) return true;
    }
    return false;
  };
  rec();
  return { count, solution: first };
}

// 난이도별로 남길 힌트 수의 목표 (더 못 지우면 그 전에 멈춘다)
const LEVELS = {
  easy: { name: '쉬움', clues: 40, base: 1000 },
  normal: { name: '보통', clues: 32, base: 2000 },
  hard: { name: '어려움', clues: 26, base: 3500 },
};

// 새 문제: 완성된 판을 하나 만들고, 칸을 하나씩 비워 보며 정답이 계속 하나뿐인 칸만 비운다.
function generate(level = 'normal', rng = Math.random) {
  const solution = solve(new Array(81).fill(0), 1, rng).solution;
  const puzzle = solution.slice();
  const target = LEVELS[level].clues;
  let clues = 81;
  for (const i of shuffled([...Array(81).keys()], rng)) {
    if (clues <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (solve(puzzle, 2).count !== 1) puzzle[i] = keep; else clues--;
  }
  return { puzzle, solution, clues };
}

// 한 칸에 들어갈 수 있는 숫자들 (메모 자동 채우기 · 힌트용)
function candidates(grid, i) {
  let used = 0;
  for (const j of PEERS[i]) if (grid[j]) used |= bit(grid[j]);
  const out = [];
  for (let v = 1; v <= 9; v++) if (!(used & bit(v))) out.push(v);
  return out;
}

// 같은 줄·열·박스에 같은 숫자가 있는 칸들 (틀림 표시용)
function conflicts(grid) {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    for (const j of PEERS[i]) if (grid[j] === grid[i]) { bad.add(i); bad.add(j); }
  }
  return bad;
}

const isComplete = (grid, solution) => grid.every((v, i) => v === solution[i]);
const countOf = (grid, v) => grid.reduce((n, x) => n + (x === v ? 1 : 0), 0);

// 점수: 난이도 기본점 - 걸린 시간 - 실수·힌트 감점 (최소 100)
function score(level, seconds, mistakes, hints) {
  return Math.max(100, LEVELS[level].base - Math.floor(seconds) * 2 - mistakes * 150 - hints * 200);
}

const LOGIC = { N, LEVELS, PEERS, rowOf, colOf, boxOf, solve, generate, candidates, conflicts, isComplete, countOf, score };
if (typeof module !== 'undefined') module.exports = LOGIC;
