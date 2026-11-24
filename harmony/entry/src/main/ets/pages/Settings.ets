import { common } from '@kit.AbilityKit';
import { router } from '@kit.ArkUI';
import { KEY_TOKEN, KEY_GIST, Loaded, loadCache, saveSetting, readSetting, readGistId, refreshAllForms } from '../common/Sync';
import { formatNum } from '../common/Grid';

@Entry
@Component
struct Settings {
  @State token: string = '';
  @State gistId: string = '';
  @State status: string = '';
  @State today: number = 0;
  @State monthTotal: number = 0;
  @State yearTotal: number = 0;

  aboutToAppear(): void {
    this.reload();
  }

  private ctx(): common.Context {
    return this.getUIContext().getHostContext() as common.Context;
  }

  private reload(): void {
    const ctx: common.Context = this.ctx();
    this.token = readSetting(ctx, KEY_TOKEN);
    this.gistId = readGistId(ctx);
    const d: Loaded = loadCache(ctx);
    this.today = d.today;
    this.monthTotal = d.monthTotal;
    this.yearTotal = d.yearTotal;
    if (d.updated.length > 0) {
      this.status = '数据时间 ' + this.localTime(d.updated);
    }
  }

  private localTime(iso: string): string {
    const t: Date = new Date(iso);
    if (Number.isNaN(t.getTime())) {
      return iso.substring(0, 16).replace('T', ' ');
    }
    const two = (n: number): string => n < 10 ? '0' + n.toString() : n.toString();
    return two(t.getMonth() + 1) + '-' + two(t.getDate()) + ' ' + two(t.getHours()) + ':' + two(t.getMinutes());
  }

  private save(): void {
    const ctx: common.Context = this.ctx();
    saveSetting(ctx, KEY_TOKEN, this.token.trim());
    saveSetting(ctx, KEY_GIST, this.gistId.trim());
    this.status = '已保存';
  }

  private async sync(): Promise<void> {
    this.status = '同步中…';
    const ok: boolean = await refreshAllForms(this.ctx());
    this.reload();
    this.status = ok ? '同步成功' : '同步失败：检查 token / gistId / 网络';
  }

  build() {
    Column() {
      Row() {
        Text('返回')
          .fontSize(13)
          .fontColor($r('app.color.text_secondary'))
          .padding({ right: 12, top: 6, bottom: 6 })
          .onClick(() => {
            router.back();
          })
        Text('设置')
          .fontSize(20)
          .fontWeight(FontWeight.Medium)
          .fontColor($r('app.color.text_primary'))
      }
      .width('100%')
      .padding({ left: 18, right: 18, top: 10, bottom: 10 })

      Column({ space: 10 }) {
        Text('同步')
          .fontSize(12)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')

        TextInput({ text: this.token, placeholder: 'GitHub token（勾选 gist 权限）' })
          .height(46)
          .fontSize(13)
          .onChange((v: string) => {
            this.token = v;
          })

        TextInput({ text: this.gistId, placeholder: 'gistId' })
          .height(46)
          .fontSize(13)
          .onChange((v: string) => {
            this.gistId = v;
          })

        Row({ space: 10 }) {
          Button('保存')
            .layoutWeight(1)
            .height(42)
            .fontSize(14)
            .backgroundColor($r('app.color.accent'))
            .onClick(() => {
              this.save();
            })
          Button('立即同步')
            .layoutWeight(1)
            .height(42)
            .fontSize(14)
            .backgroundColor($r('app.color.text_primary'))
            .onClick(() => {
              this.sync();
            })
        }
        .width('100%')

        Text(this.status)
          .fontSize(11)
          .fontColor($r('app.color.accent'))
          .width('100%')
      }
      .width('100%')
      .padding(18)
      .backgroundColor($r('app.color.card_bg'))
      .borderRadius(16)
      .margin({ left: 14, right: 14 })

      Column({ space: 8 }) {
        Text('当前数据')
          .fontSize(12)
          .fontColor($r('app.color.text_tertiary'))
          .width('100%')
        Row() {
          Text('今日').fontSize(13).fontColor($r('app.color.text_secondary')).width(70)
          Text(formatNum(this.today) + ' 行').fontSize(13).fontColor($r('app.color.text_primary'))
        }
        .width('100%')
        Row() {
          Text('本月').fontSize(13).fontColor($r('app.color.text_secondary')).width(70)
          Text(formatNum(this.monthTotal) + ' 行').fontSize(13).fontColor($r('app.color.text_primary'))
        }
        .width('100%')
        Row() {
          Text('本年').fontSize(13).fontColor($r('app.color.text_secondary')).width(70)
          Text(formatNum(this.yearTotal) + ' 行').fontSize(13).fontColor($r('app.color.text_primary'))
        }
        .width('100%')
      }
      .width('100%')
      .padding(18)
      .backgroundColor($r('app.color.card_bg'))
      .borderRadius(16)
      .margin({ top: 12, left: 14, right: 14 })

      Text('电脑上每 15 分钟自动推到 Gist，卡片每 30 分钟拉一次；打开 App 会立刻刷新。')
        .fontSize(11)
        .fontColor($r('app.color.text_hint'))
        .padding({ left: 18, right: 18, top: 14 })
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.page_bg'))
    .alignItems(HorizontalAlign.Start)
  }
}
