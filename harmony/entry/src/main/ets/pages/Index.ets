import { common } from '@kit.AbilityKit';
import { router } from '@kit.ArkUI';
import { Loaded, loadCache, refreshAllForms } from '../common/Sync';
import {
  toNumbers, maxOf, cellColor, formatNum, monthBlocks, MonthBlock,
  parseLangs, LangItem, langColor
} from '../common/Grid';

const PITCH: number = 11.5;
const CELL: number = 9;
const GRID_H: number = 78;
const BAR_H: number = 34;

class Info {
  year: number = 0;
  yearTotal: number = 0;
  yearActive: number = 0;
  yearAvg: number = 0;
  streak: number = 0;
  cells: string = '';
  weeks: number = 0;
  offset: number = 0;
  peak: number = 0;
  months: number[] = [];
  monthsA: number[] = [];
  monthsB: number[] = [];
  maxMonth: number = 0;
  curMonth: number = 0;
  blocks: MonthBlock[] = [];
  yearLangs: string = '';
  yearLangsTop: number = 0;
  ides: string = '';
  idesTop: number = 0;
  updated: string = '';
}

function toInfo(d: Loaded): Info {
  const info: Info = new Info();
  info.year = d.year > 0 ? d.year : new Date().getFullYear();
  info.yearTotal = d.yearTotal;
  info.yearActive = d.yearActive;
  info.yearAvg = d.yearAvg;
  info.streak = d.streak;
  info.cells = d.yearCells;
  info.weeks = d.yearWeeks > 0 ? d.yearWeeks : 53;
  info.offset = d.yearOffset;
  info.peak = d.yearPeak;
  info.months = toNumbers(d.months);
  info.monthsA = info.months.slice(0, 6);
  info.monthsB = info.months.slice(6);
  info.maxMonth = maxOf(info.months);
  info.curMonth = new Date().getMonth() + 1;
  info.blocks = monthBlocks(d.yearCells, info.year, d.yearOffset);
  info.yearLangs = d.yearLangs;
  info.yearLangsTop = d.yearLangsTop;
  info.ides = d.ides;
  info.idesTop = d.idesTop;
  info.updated = d.updated;
  return info;
}

@Entry
@Component
struct Index {
  @State info: Info = new Info();
  @State status: string = '';
  @State selText: string = '';
  private hmScroller: Scroller = new Scroller();
  private hmInit: boolean = false;

  aboutToAppear(): void {
    this.reload();
    if (!this.hmInit) {
      this.hmInit = true;
      // 冷启动时布局还没算好，300ms 偶发失效；连打三次，谁先成功算谁
      setTimeout(() => {
        this.hmScroller.scrollEdge(Edge.End);
      }, 200);
      setTimeout(() => {
        this.hmScroller.scrollEdge(Edge.End);
      }, 700);
      setTimeout(() => {
        this.hmScroller.scrollEdge(Edge.End);
      }, 1500);
    }
  }

  onPageShow(): void {
    this.reload();
    this.syncNow();
  }

  private ctx(): common.Context {
    return this.getUIContext().getHostContext() as common.Context;
  }

  private reload(): void {
    const d: Loaded = loadCache(this.ctx());
    this.info = toInfo(d);
  }

  private async syncNow(): Promise<void> {
    const ok: boolean = await refreshAllForms(this.ctx());
    if (ok) {
      this.reload();
      this.status = '已更新 ' + this.localTime(this.info.updated);
    } else {
      this.status = this.info.updated.length > 0
        ? '离线 · 数据 ' + this.localTime(this.info.updated)
        : '还没有数据，去设置里填 token';
    }
  }

  private localTime(iso: string): string {
    if (iso.length === 0) {
      return '--';
    }
    const t: Date = new Date(iso);
    if (Number.isNaN(t.getTime())) {
      return iso.substring(5, 16).replace('T', ' ');
    }
    const two = (n: number): string => n < 10 ? '0' + n.toString() : n.toString();
    return two(t.getMonth() + 1) + '-' + two(t.getDate()) + ' ' + two(t.getHours()) + ':' + two(t.getMinutes());
  }

  /** 一个月方块的像素宽度：列数 * 间距 - 最后一段间距 */
  private blockW(cols: number): number {
    return cols * PITCH - (PITCH - CELL);
  }

  private barW(value: number, top: number): number {
    const base: number = top > 0 ? top : 1;
    const w: number = Math.round((value / base) * 132);
    return w < 4 ? 4 : w;
  }

  private monthH(v: number): number {
    if (v <= 0) {
      return 2;
    }
    const base: number = this.info.maxMonth > 0 ? this.info.maxMonth : 1;
    const h: number = Math.round((v / base) * BAR_H);
    return h < 4 ? 4 : h;
  }

  @Builder
  heroCard() {
    Column() {
      Text(this.info.year.toString() + ' 年')
        .fontSize(12)
        .fontColor($r('app.color.text_tertiary'))
      Row() {
        Text(formatNum(this.info.yearTotal))
          .fontSize(38)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary'))
        Text('行')
          .fontSize(13)
          .fontColor($r('app.color.text_tertiary'))
          .margin({ left: 6, bottom: 8 })
      }
      .alignItems(VerticalAlign.Bottom)
      .margin({ top: 2 })

      Text('活跃 ' + this.info.yearActive.toString() + ' 天 · 日均 ' + this.info.yearAvg.toString()
        + ' 行 · 最长连续 ' + this.info.streak.toString() + ' 天')
        .fontSize(12)
        .fontColor($r('app.color.text_secondary'))
        .margin({ top: 6 })
    }
    .alignItems(HorizontalAlign.Start)
    .width('100%')
    .padding(18)
    .backgroundColor($r('app.color.card_bg'))
    .borderRadius(16)
  }

  @Builder
  heatCard() {
    Column() {
      Row() {
        Text('年度活跃')
          .fontSize(12)
          .fontColor($r('app.color.text_tertiary'))
        Blank()
        Text(this.selText.length > 0 ? this.selText : '点方块看日期')
          .fontSize(this.selText.length > 0 ? 12 : 10)
          .fontWeight(this.selText.length > 0 ? FontWeight.Medium : FontWeight.Regular)
          .fontColor(this.selText.length > 0 ? $r('app.color.accent') : $r('app.color.text_hint'))
      }
      .width('100%')
      .margin({ bottom: 10 })

      Scroll(this.hmScroller) {
        Row({ space: 16 }) {
          ForEach(this.info.blocks, (b: MonthBlock, bi: number) => {
            Column() {
              Text(b.label)
                .fontSize(9)
                .fontColor($r('app.color.text_hint'))
                .width(this.blockW(b.cols.length))
                .textAlign(TextAlign.Center)
                .margin({ bottom: 6 })

              Row({ space: PITCH - CELL }) {
                ForEach(b.cols, (col: number[], ci: number) => {
                  Column({ space: PITCH - CELL }) {
                    ForEach(col, (v: number, ri: number) => {
                      Column()
                        .width(CELL)
                        .height(CELL)
                        .borderRadius(2)
                        .backgroundColor(cellColor(v, this.info.peak))
                        .onClick(() => {
                          const day: number = ci * 7 + ri - b.off + 1;
                          if (day >= 1 && day <= b.days) {
                            this.selText = (bi + 1).toString() + '月' + day.toString()
                              + '日 · ' + formatNum(v) + ' 行';
                          }
                        })
                    }, (v: number, ri: number) => 'y' + bi + '_' + ci + '_' + ri + '_' + v)
                  }
                }, (col: number[], ci: number) => 'yc' + bi + '_' + ci + '_' + col.join(','))
              }
            }
            .alignItems(HorizontalAlign.Start)
          }, (b: MonthBlock, bi: number) => 'blk' + bi + '_' + b.label)
        }
        .alignItems(VerticalAlign.Top)
      }
      .scrollable(ScrollDirection.Horizontal)
      .scrollBar(BarState.Off)
      .width('100%')
      .height(GRID_H + 24)
      .align(Alignment.TopStart)
    }
    .alignItems(HorizontalAlign.Start)
    .width('100%')
    .padding(18)
    .backgroundColor($r('app.color.card_bg'))
    .borderRadius(16)
  }

  @Builder
  monthCard() {
    Column() {
      Text('每月行数')
        .fontSize(12)
        .fontColor($r('app.color.text_tertiary'))
        .margin({ bottom: 10 })

      Row({ space: 4 }) {
        ForEach(this.info.monthsA, (v: number, i: number) => {
          Column() {
            Blank()
            Text(v > 0 ? formatNum(v) : '-')
              .fontSize(9)
              .maxLines(1)
              .fontColor(v > 0 ? $r('app.color.text_tertiary') : $r('app.color.text_hint'))
              .margin({ bottom: 4 })
            Column()
              .width(20)
              .height(this.monthH(v))
              .borderRadius(3)
              .backgroundColor(i + 1 === this.info.curMonth ? $r('app.color.accent_bright') : $r('app.color.accent'))
            Text((i + 1).toString() + '月')
              .fontSize(11)
              .maxLines(1)
              .fontWeight(i + 1 === this.info.curMonth ? FontWeight.Medium : FontWeight.Regular)
              .fontColor(i + 1 === this.info.curMonth
                ? $r('app.color.accent')
                : (v > 0 ? $r('app.color.text_secondary') : $r('app.color.text_hint')))
              .margin({ top: 6 })
          }
          .layoutWeight(1)
          .height(BAR_H + 46)
          .justifyContent(FlexAlign.End)
        }, (v: number, i: number) => 'ma' + i + '_' + v)
      }
      .width('100%')
      .alignItems(VerticalAlign.Bottom)

      Row({ space: 4 }) {
        ForEach(this.info.monthsB, (v: number, i: number) => {
          Column() {
            Blank()
            Text(v > 0 ? formatNum(v) : '-')
              .fontSize(9)
              .maxLines(1)
              .fontColor(v > 0 ? $r('app.color.text_tertiary') : $r('app.color.text_hint'))
              .margin({ bottom: 4 })
            Column()
              .width(20)
              .height(this.monthH(v))
              .borderRadius(3)
              .backgroundColor(i + 7 === this.info.curMonth ? $r('app.color.accent_bright') : $r('app.color.accent'))
            Text((i + 7).toString() + '月')
              .fontSize(11)
              .maxLines(1)
              .fontWeight(i + 7 === this.info.curMonth ? FontWeight.Medium : FontWeight.Regular)
              .fontColor(i + 7 === this.info.curMonth
                ? $r('app.color.accent')
                : (v > 0 ? $r('app.color.text_secondary') : $r('app.color.text_hint')))
              .margin({ top: 6 })
          }
          .layoutWeight(1)
          .height(BAR_H + 46)
          .justifyContent(FlexAlign.End)
        }, (v: number, i: number) => 'mb' + i + '_' + v)
      }
      .width('100%')
      .alignItems(VerticalAlign.Bottom)
      .margin({ top: 12 })
    }
    .alignItems(HorizontalAlign.Start)
    .width('100%')
    .padding(18)
    .backgroundColor($r('app.color.card_bg'))
    .borderRadius(16)
  }

  /** 无参 Builder：带参数的 @Builder 按值传递，不会随状态刷新 */
  @Builder
  langCard() {
    Column() {
      Text('语言分布')
        .fontSize(12)
        .fontColor($r('app.color.text_tertiary'))
        .margin({ bottom: 10 })

      ForEach(parseLangs(this.info.yearLangs), (it: LangItem, i: number) => {
        Row() {
          Text(it.name)
            .fontSize(13)
            .fontColor($r('app.color.text_primary'))
            .width(122)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Stack({ alignContent: Alignment.Start }) {
            Column().width(132).height(7).borderRadius(3.5).backgroundColor($r('app.color.track'))
            Column().width(this.barW(it.lines, this.info.yearLangsTop)).height(7).borderRadius(3.5)
              .backgroundColor(langColor(i))
          }
          .width(132)
          .height(7)
          .margin({ left: 10 })
          Blank()
          Text(formatNum(it.lines))
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
        }
        .width('100%')
        .alignItems(VerticalAlign.Center)
        .margin({ bottom: 10 })
      }, (it: LangItem, i: number) => 'lg' + it.name + '_' + it.lines + '_' + i)
    }
    .alignItems(HorizontalAlign.Start)
    .width('100%')
    .padding(18)
    .backgroundColor($r('app.color.card_bg'))
    .borderRadius(16)
  }

  @Builder
  ideCard() {
    Column() {
      Text('IDE 分布')
        .fontSize(12)
        .fontColor($r('app.color.text_tertiary'))
        .margin({ bottom: 10 })

      ForEach(parseLangs(this.info.ides), (it: LangItem, i: number) => {
        Row() {
          Text(it.name)
            .fontSize(13)
            .fontColor($r('app.color.text_primary'))
            .width(122)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Stack({ alignContent: Alignment.Start }) {
            Column().width(132).height(7).borderRadius(3.5).backgroundColor($r('app.color.track'))
            Column().width(this.barW(it.lines, this.info.idesTop)).height(7).borderRadius(3.5)
              .backgroundColor(langColor(i))
          }
          .width(132)
          .height(7)
          .margin({ left: 10 })
          Blank()
          Text(formatNum(it.lines))
            .fontSize(12)
            .fontColor($r('app.color.text_secondary'))
        }
        .width('100%')
        .alignItems(VerticalAlign.Center)
        .margin({ bottom: 10 })
      }, (it: LangItem, i: number) => 'id' + it.name + '_' + it.lines + '_' + i)
    }
    .alignItems(HorizontalAlign.Start)
    .width('100%')
    .padding(18)
    .backgroundColor($r('app.color.card_bg'))
    .borderRadius(16)
  }

  build() {
    Column() {
      Row() {
        Text('CodeStats')
          .fontSize(20)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary'))
        Blank()
        Text('设置')
          .fontSize(13)
          .fontColor($r('app.color.text_secondary'))
          .padding({ left: 12, right: 4, top: 6, bottom: 6 })
          .onClick(() => {
            router.pushUrl({ url: 'pages/Settings' });
          })
      }
      .width('100%')
      .padding({ left: 18, right: 14, top: 10, bottom: 10 })

      Scroll() {
        Column({ space: 12 }) {
          this.heroCard()
          this.heatCard()
          this.monthCard()
          this.langCard()
          this.ideCard()

          Text(this.status)
            .fontSize(10)
            .fontColor($r('app.color.text_hint'))
            .width('100%')
            .margin({ top: 2, bottom: 12 })
        }
        .width('100%')
        .padding({ left: 14, right: 14 })
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.TopStart)
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.page_bg'))
  }
}
