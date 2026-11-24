import { toRows, cellColor, formatNum, parseLangs, langColor, monthText, parseCard, emptyCard, LangItem, CardData } from '../../common/Grid';

const WEEK_LABELS: string[] = ['一', '二', '三', '四', '五', '六', '日'];
const CELL: number = 11;
const GAP: number = 2;
const STAT_W: number = 86;
const BAR_W: number = 24;
const BAR_H: number = 5;
const COUNT_W: number = 20;

let storage: LocalStorage = new LocalStorage();

@Entry(storage)
@Component
struct WidgetCard {
  @LocalStorageProp('data') data: string = '';

  private cachedRaw: string = '';
  private cached: CardData = emptyCard();

  private d(): CardData {
    if (this.cachedRaw !== this.data) {
      this.cached = parseCard(this.data);
      this.cachedRaw = this.data;
    }
    return this.cached;
  }

  private enterApp(): void {
    postCardAction(this, {
      action: 'router',
      abilityName: 'EntryAbility',
      params: {
        'from': 'card'
      }
    });
  }

  private barWidth(lines: number): number {
    const top: number = this.d().langTop;
    const base: number = top > 0 ? top : 1;
    const w: number = Math.round((lines / base) * BAR_W);
    return w < 3 ? 3 : w;
  }

  /** 无参 @Builder：带参数的 @Builder 是「按值传递」，参数不会随状态刷新，数字会永远停在首帧 */
  @Builder
  statsBlock() {
    Column({ space: 6 }) {
      Row() {
        Text('今日').fontSize(11).fontColor($r('app.color.text_secondary'))
        Blank()
        Text(formatNum(this.d().today)).fontSize(19).fontWeight(FontWeight.Medium).fontColor($r('app.color.accent'))
        Text('行').fontSize(9).fontColor($r('app.color.text_tertiary')).margin({ left: 2, bottom: 1 })
      }
      .width('100%')
      .alignItems(VerticalAlign.Bottom)

      Row() {
        Text('本月').fontSize(11).fontColor($r('app.color.text_secondary'))
        Blank()
        Text(formatNum(this.d().monthTotal)).fontSize(19).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
        Text('行').fontSize(9).fontColor($r('app.color.text_tertiary')).margin({ left: 2, bottom: 1 })
      }
      .width('100%')
      .alignItems(VerticalAlign.Bottom)

      Row() {
        Text('本年').fontSize(11).fontColor($r('app.color.text_secondary'))
        Blank()
        Text(formatNum(this.d().yearTotal)).fontSize(19).fontWeight(FontWeight.Medium).fontColor($r('app.color.text_primary'))
        Text('行').fontSize(9).fontColor($r('app.color.text_tertiary')).margin({ left: 2, bottom: 1 })
      }
      .width('100%')
      .alignItems(VerticalAlign.Bottom)
    }
    .width('100%')
    .alignItems(HorizontalAlign.Start)
  }

  @Builder
  langRow(item: LangItem, index: number) {
    Row() {
      Text(item.name)
        .fontSize(10)
        .fontColor($r('app.color.text_primary'))
        .layoutWeight(1)
        .maxLines(1)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
      Stack({ alignContent: Alignment.Start }) {
        Column()
          .width(BAR_W)
          .height(BAR_H)
          .borderRadius(BAR_H / 2)
          .backgroundColor($r('app.color.track'))
        Column()
          .width(this.barWidth(item.lines))
          .height(BAR_H)
          .borderRadius(BAR_H / 2)
          .backgroundColor(langColor(index))
      }
      .width(BAR_W)
      .height(BAR_H)
      .margin({ left: 5 })
      Text(formatNum(item.lines))
        .fontSize(10)
        .fontColor($r('app.color.text_tertiary'))
        .width(COUNT_W)
        .textAlign(TextAlign.End)
    }
    .width('100%')
    .alignItems(VerticalAlign.Center)
  }

  build() {
    Column() {
      Row() {
        Text('CODESTATS')
          .fontSize(11)
          .fontColor($r('app.color.text_secondary'))
          .letterSpacing(1.2)
        Blank()
        Text(monthText(this.d().month))
          .fontSize(11)
          .fontColor($r('app.color.text_secondary'))
      }
      .width('100%')
      .margin({ bottom: 6 })

      Row() {
        Column() {
          Row({ space: GAP }) {
            ForEach(WEEK_LABELS, (lb: string, li: number) => {
              Text(lb)
                .fontSize(10)
                .fontColor($r('app.color.text_hint'))
                .width(CELL)
                .textAlign(TextAlign.Center)
            }, (lb: string, li: number) => 'lb' + li)
          }
          .margin({ bottom: 4 })

          Column({ space: GAP }) {
            ForEach(toRows(this.d().cells), (row: number[], ri: number) => {
              Row({ space: GAP }) {
                ForEach(row, (v: number, ci: number) => {
                  Column()
                    .width(CELL)
                    .height(CELL)
                    .borderRadius(2.5)
                    .backgroundColor(cellColor(v, this.d().peak))
                }, (v: number, ci: number) => 'c' + ri + '_' + ci + '_' + v)
              }
            }, (row: number[], ri: number) => 'r' + ri + '_' + row.join(','))
          }
        }

        Column() {
          this.statsBlock()
        }
        .width(STAT_W)
        .margin({ left: 14 })

        Column({ space: 4 }) {
          ForEach(parseLangs(this.d().langs), (it: LangItem, i: number) => {
            this.langRow(it, i)
          }, (it: LangItem, i: number) => 'l' + it.name + '_' + it.lines + '_' + i)
        }
        .layoutWeight(1)
        .alignItems(HorizontalAlign.Start)
        .margin({ left: 10 })
      }
      .width('100%')
      .layoutWeight(1)
      .alignItems(VerticalAlign.Top)
    }
    .width('100%')
    .height('100%')
    .padding(11)
    .backgroundColor($r('app.color.card_bg'))
    .borderRadius(18)
    .alignItems(HorizontalAlign.Start)
    .onClick(() => {
      this.enterApp();
    })
  }
}
