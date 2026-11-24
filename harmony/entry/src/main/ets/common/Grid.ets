const ROWS: number = 6;
const COLS: number = 7;

/**
 * cells 是按日历顺序（周一到周日，逐行）排列的 42 个数字，-1 表示不在本月。
 * 这里切成 6 行 × 7 列，1 日就落在它对应的星期几那一格。
 */
export function toRows(cells: string): number[][] {
  const parts: string[] = cells.length > 0 ? cells.split(',') : [];
  const blank: boolean = parts.length === 0;
  const rows: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const i: number = r * COLS + c;
      let v: number = blank ? 0 : -1;
      if (i < parts.length) {
        const n: number = Number(parts[i]);
        if (!Number.isNaN(n)) {
          v = n;
        }
      }
      row.push(v);
    }
    rows.push(row);
  }
  return rows;
}

/** 分档配色走资源，浅色/深色由 resources/dark 自动切换 */
export function cellColor(v: number, peak: number): Resource {
  if (v < 0) {
    return $r('app.color.cell_none');
  }
  if (v === 0) {
    return $r('app.color.cell0');
  }
  const p: number = peak > 0 ? peak : 1;
  const r: number = v / p;
  if (r <= 0.2) {
    return $r('app.color.cell1');
  }
  if (r <= 0.45) {
    return $r('app.color.cell2');
  }
  if (r <= 0.75) {
    return $r('app.color.cell3');
  }
  return $r('app.color.cell4');
}

export function formatNum(n: number): string {
  const s: string = Math.round(n).toString();
  let out: string = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) {
      out += ',';
    }
    out += s.charAt(i);
  }
  return out;
}

export interface LangItem {
  name: string;
  lines: number;
}

/** "C++:98|TypeScript:42" → [{name,lines}] */
export function parseLangs(s: string): LangItem[] {
  const out: LangItem[] = [];
  if (s.length === 0) {
    return out;
  }
  const parts: string[] = s.split('|');
  for (const part of parts) {
    const cut: number = part.lastIndexOf(':');
    if (cut <= 0) {
      continue;
    }
    const n: number = Number(part.substring(cut + 1));
    if (Number.isNaN(n)) {
      continue;
    }
    out.push({ name: part.substring(0, cut), lines: n });
  }
  return out;
}

const LANG_COLORS: string[] = ['#5aa9e6', '#c792ea', '#f0a35e', '#7bd1c4', '#8d9aa5', '#5a6660'];

export function langColor(i: number): string {
  return LANG_COLORS[i % LANG_COLORS.length];
}

export interface CardData {
  cells: string;
  langs: string;
  langTop: number;
  today: number;
  monthTotal: number;
  yearTotal: number;
  peak: number;
  month: string;
}

export function emptyCard(): CardData {
  return {
    cells: '',
    langs: '',
    langTop: 0,
    today: 0,
    monthTotal: 0,
    yearTotal: 0,
    peak: 0,
    month: ''
  };
}

/** 卡片只认一个字符串键，这里把它解成结构体。任何字段缺失都退回默认值。 */
export function parseCard(raw: string): CardData {
  const out: CardData = emptyCard();
  if (raw.length === 0) {
    return out;
  }
  try {
    const o = JSON.parse(raw) as CardData;
    if (typeof o.cells === 'string') {
      out.cells = o.cells;
    }
    if (typeof o.langs === 'string') {
      out.langs = o.langs;
    }
    if (typeof o.month === 'string') {
      out.month = o.month;
    }
    if (typeof o.langTop === 'number') {
      out.langTop = o.langTop;
    }
    if (typeof o.today === 'number') {
      out.today = o.today;
    }
    if (typeof o.monthTotal === 'number') {
      out.monthTotal = o.monthTotal;
    }
    if (typeof o.yearTotal === 'number') {
      out.yearTotal = o.yearTotal;
    }
    if (typeof o.peak === 'number') {
      out.peak = o.peak;
    }
    return out;
  } catch (e) {
    return out;
  }
}

export function monthText(month: string): string {
  if (month.length < 7) {
    return '';
  }
  const m: number = Number(month.substring(5, 7));
  return Number.isNaN(m) ? '' : m.toString() + ' 月';
}

/** 年度热力图：按周切列，每列 7 天（周一→周日），-1 表示不在今年 */
export function chunkColumns(cells: string, cols: number): number[][] {
  const parts: string[] = cells.length > 0 ? cells.split(',') : [];
  const out: number[][] = [];
  for (let c = 0; c < cols; c++) {
    const col: number[] = [];
    for (let r = 0; r < 7; r++) {
      const i: number = c * 7 + r;
      let v: number = -1;
      if (i < parts.length) {
        const n: number = Number(parts[i]);
        if (!Number.isNaN(n)) {
          v = n;
        }
      }
      col.push(v);
    }
    out.push(col);
  }
  return out;
}

/** "0,0,2109,..." → number[] */
export function toNumbers(csv: string): number[] {
  const out: number[] = [];
  if (csv.length === 0) {
    return out;
  }
  const parts: string[] = csv.split(',');
  for (const p of parts) {
    const n: number = Number(p);
    out.push(Number.isNaN(n) ? 0 : n);
  }
  return out;
}

export function maxOf(list: number[]): number {
  let m: number = 0;
  for (const v of list) {
    if (v > m) {
      m = v;
    }
  }
  return m;
}

export interface MonthBlock {
  label: string;
  cols: number[][];
  off: number;
  days: number;
}

/**
 * 把连续的年度格子切成「每月一块」的日历：每块独立从该月 1 号的星期位开始，
 * 行 = 周一→周日，列 = 第几周。cells 是连续年度数组，yearOffset 是 1 月 1 日的星期偏移。
 */
export function monthBlocks(cells: string, year: number, yearOffset: number): MonthBlock[] {
  const parts: string[] = cells.length > 0 ? cells.split(',') : [];
  const out: MonthBlock[] = [];
  let doy: number = 0;
  for (let m = 1; m <= 12; m++) {
    const days: number = new Date(year, m, 0).getDate();
    const off: number = (yearOffset + doy) % 7;
    const cols: number = Math.ceil((off + days) / 7);
    const block: number[][] = [];
    for (let c = 0; c < cols; c++) {
      const col: number[] = [];
      for (let r = 0; r < 7; r++) {
        const day: number = c * 7 + r - off + 1;
        let v: number = -1;
        if (day >= 1 && day <= days) {
          v = 0;
          const i: number = yearOffset + doy + day - 1;
          if (i < parts.length) {
            const n: number = Number(parts[i]);
            if (!Number.isNaN(n)) {
              v = n;
            }
          }
        }
        col.push(v);
      }
      block.push(col);
    }
    out.push({ label: m.toString() + '月', cols: block, off: off, days: days });
    doy += days;
  }
  return out;
}
