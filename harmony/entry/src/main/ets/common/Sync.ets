import { preferences } from '@kit.ArkData';
import { http } from '@kit.NetworkKit';
import { common } from '@kit.AbilityKit';
import { formBindingData, formProvider } from '@kit.FormKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';

const STORE_NAME: string = 'codestats';
const GIST_API: string = 'https://api.github.com/gists/';
const GIST_FILE: string = 'codestats.json';

export const KEY_CACHE: string = 'cache';
export const KEY_TOKEN: string = 'token';
export const KEY_GIST: string = 'gistId';

/** 预置的 Gist id，省得在手机上敲；token 仍然要手填 */
const DEFAULT_GIST: string = '02dedad92414b9a313018bb357f4f18d';
const KEY_FORMS: string = 'formIds';

export interface Loaded {
  month: string;
  today: number;
  monthTotal: number;
  yearTotal: number;
  peak: number;
  cells: string;
  langs: string;
  langTop: number;
  updated: string;
  year: number;
  yearCells: string;
  yearWeeks: number;
  yearOffset: number;
  yearPeak: number;
  months: string;
  yearLangs: string;
  yearLangsTop: number;
  ides: string;
  idesTop: number;
  yearActive: number;
  yearAvg: number;
  streak: number;
}

interface GistFile {
  content: string;
}

interface GistResp {
  files: Record<string, GistFile>;
}

export function emptyLoaded(): Loaded {
  return {
    month: '',
    today: 0,
    monthTotal: 0,
    yearTotal: 0,
    peak: 0,
    cells: '',
    langs: '',
    langTop: 0,
    updated: '',
    year: 0,
    yearCells: '',
    yearWeeks: 0,
    yearOffset: 0,
    yearPeak: 0,
    months: '',
    yearLangs: '',
    yearLangsTop: 0,
    ides: '',
    idesTop: 0,
    yearActive: 0,
    yearAvg: 0,
    streak: 0
  };
}

function openStore(ctx: common.Context): preferences.Preferences | null {
  const opt: preferences.Options = { name: STORE_NAME };
  try {
    return preferences.getPreferencesSync(ctx, opt);
  } catch (err) {
    return null;
  }
}

export function readSetting(ctx: common.Context, key: string): string {
  try {
    const store: preferences.Preferences | null = openStore(ctx);
    if (store === null) {
      return '';
    }
    const v: preferences.ValueType = store.getSync(key, '');
    return typeof v === 'string' ? v as string : '';
  } catch (err) {
    return '';
  }
}

export function saveSetting(ctx: common.Context, key: string, value: string): void {
  try {
    const store: preferences.Preferences | null = openStore(ctx);
    if (store === null) {
      return;
    }
    store.putSync(key, value);
    store.flush();
  } catch (err) {
  }
}

export function loadCache(ctx: common.Context): Loaded {
  const raw: string = readSetting(ctx, KEY_CACHE);
  if (raw.length === 0) {
    return emptyLoaded();
  }
  try {
    const d: Loaded = JSON.parse(raw) as Loaded;
    if (typeof d.cells !== 'string') {
      d.cells = '';
    }
    if (typeof d.langs !== 'string') {
      d.langs = '';
    }
    if (typeof d.langTop !== 'number') {
      d.langTop = 0;
    }
    return d;
  } catch (err) {
    return emptyLoaded();
  }
}

function saveCache(ctx: common.Context, d: Loaded): void {
  saveSetting(ctx, KEY_CACHE, JSON.stringify(d));
}

function readFormIds(ctx: common.Context): string[] {
  const raw: string = readSetting(ctx, KEY_FORMS);
  if (raw.length === 0) {
    return [];
  }
  try {
    return JSON.parse(raw) as string[];
  } catch (err) {
    return [];
  }
}

function saveFormIds(ctx: common.Context, ids: string[]): void {
  saveSetting(ctx, KEY_FORMS, JSON.stringify(ids));
}

export function addFormId(ctx: common.Context, formId: string): void {
  const ids: string[] = readFormIds(ctx);
  if (ids.indexOf(formId) < 0) {
    ids.push(formId);
    saveFormIds(ctx, ids);
  }
  hilog.info(0x0000, 'CSDBG', 'addFormId=%{public}s total=%{public}d', formId, ids.length);
}

export function removeFormId(ctx: common.Context, formId: string): void {
  const ids: string[] = readFormIds(ctx);
  const next: string[] = [];
  for (const id of ids) {
    if (id !== formId) {
      next.push(id);
    }
  }
  saveFormIds(ctx, next);
}

/** 没填过就用预置值 */
export function readGistId(ctx: common.Context): string {
  const v: string = readSetting(ctx, KEY_GIST);
  return v.length > 0 ? v : DEFAULT_GIST;
}

export async function fetchRemote(ctx: common.Context): Promise<Loaded | null> {
  const token: string = readSetting(ctx, KEY_TOKEN);
  const gistId: string = readGistId(ctx);
  if (token.length === 0 || gistId.length === 0) {
    return null;
  }
  const client: http.HttpRequest = http.createHttp();
  try {
    const resp: http.HttpResponse = await client.request(GIST_API + gistId, {
      method: http.RequestMethod.GET,
      header: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'codestats-harmony'
      },
      connectTimeout: 4000,
      readTimeout: 4000,
      expectDataType: http.HttpDataType.STRING
    });
    if (resp.responseCode !== 200) {
      return null;
    }
    const body: string = resp.result as string;
    const gist: GistResp = JSON.parse(body) as GistResp;
    const file: GistFile = gist.files[GIST_FILE];
    const d: Loaded = JSON.parse(file.content) as Loaded;
    saveCache(ctx, d);
    return d;
  } catch (err) {
    return null;
  } finally {
    client.destroy();
  }
}

function monthLabel(month: string): string {
  if (month.length < 7) {
    return '';
  }
  const m: number = Number(month.substring(5, 7));
  return Number.isNaN(m) ? '' : m.toString() + ' 月';
}

export function toBinding(d: Loaded): formBindingData.FormBindingData {
  // 只传一个字符串键：LocalStorage 里键的类型由首次写入决定，之前把数字拆成独立
  // 键时，后续 updateForm 传 string 也覆盖不回去，表现为数字永远显示 0。
  // 现在整包 JSON 塞进一个 string 键，卡片端 parseCard() 自己解。
  const obj: Record<string, string> = { 'data': JSON.stringify(d) };
  return formBindingData.createFormBindingData(obj);
}

export async function pushToForms(ctx: common.Context, d: Loaded): Promise<void> {
  const ids: string[] = readFormIds(ctx);
  hilog.info(0x0000, 'CSDBG', 'pushToForms count=%{public}d today=%{public}s month=%{public}s', ids.length, d.today.toString(), d.monthTotal.toString());
  const binding: formBindingData.FormBindingData = toBinding(d);
  for (const id of ids) {
    try {
      await formProvider.updateForm(id, binding);
      hilog.info(0x0000, 'CSDBG', 'updateForm ok %{public}s', id);
    } catch (err) {
      const e = err as BusinessError;
      hilog.error(0x0000, 'CSDBG', 'updateForm FAIL %{public}s code=%{public}d msg=%{public}s', id, e.code, e.message);
    }
  }
}

export async function refreshAllForms(ctx: common.Context): Promise<boolean> {
  const d: Loaded | null = await fetchRemote(ctx);
  hilog.info(0x0000, 'CSDBG', 'refreshAllForms fetched=%{public}d', d === null ? 0 : 1);
  if (d === null) {
    return false;
  }
  await pushToForms(ctx, d);
  return true;
}
