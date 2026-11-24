import { FormExtensionAbility, formBindingData, formProvider } from '@kit.FormKit';
import { Want } from '@kit.AbilityKit';
import { Loaded, loadCache, toBinding, addFormId, removeFormId, fetchRemote } from '../common/Sync';

export default class EntryFormAbility extends FormExtensionAbility {
  private readFormId(want: Want): string {
    const params: Record<string, Object> | undefined = want.parameters;
    if (params === undefined) {
      return '';
    }
    const v: Object = params['ohos.extra.param.key.form_identity'];
    return typeof v === 'string' ? v as string : '';
  }

  onAddForm(want: Want): formBindingData.FormBindingData {
    const formId: string = this.readFormId(want);
    if (formId.length > 0) {
      addFormId(this.context, formId);
    }
    const cached: Loaded = loadCache(this.context);
    return toBinding(cached);
  }

  onUpdateForm(formId: string): void {
    this.refresh(formId);
  }

  onFormEvent(formId: string, message: string): void {
  }

  onRemoveForm(formId: string): void {
    removeFormId(this.context, formId);
  }

  private async refresh(formId: string): Promise<void> {
    const fresh: Loaded | null = await fetchRemote(this.context);
    const data: Loaded = fresh === null ? loadCache(this.context) : fresh;
    try {
      await formProvider.updateForm(formId, toBinding(data));
    } catch (err) {
    }
  }
}
