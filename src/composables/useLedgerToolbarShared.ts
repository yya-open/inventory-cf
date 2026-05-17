import { computed, ref, type ComponentPublicInstance, type Ref } from 'vue';

export type ArchiveMode = 'active' | 'archived' | 'all';

export const archiveModeOptions: Array<{ label: string; value: ArchiveMode }> = [
  { label: '在用', value: 'active' },
  { label: '归档', value: 'archived' },
  { label: '全部', value: 'all' },
];

export function useLedgerToolbarState(selectedCount: () => number, busyFlags: () => boolean[]) {
  const importUploadRef = ref<ComponentPublicInstance | null>(null);
  const settingsVisible = ref(false);
  const bulkWorkspaceExpanded = ref(false);

  const selectionStateText = computed(() => selectedCount() > 0 ? `已选 ${selectedCount()} 项` : '未选择设备');

  const bulkWorkspaceMounted = computed(() => {
    if (bulkWorkspaceExpanded.value) return true;
    if (selectedCount() > 0) return true;
    return busyFlags().some(Boolean);
  });

  function openImportPicker() {
    const root = importUploadRef.value?.$el as HTMLElement | undefined;
    const input = root?.querySelector('input[type="file"]') as HTMLInputElement | null;
    input?.click();
  }

  return {
    importUploadRef: importUploadRef as Ref<ComponentPublicInstance | null>,
    settingsVisible,
    bulkWorkspaceExpanded,
    selectionStateText,
    bulkWorkspaceMounted,
    openImportPicker,
  };
}

export function buildArchiveModeChangeHandler(emit: {
  (event: 'update:archive-mode', value: ArchiveMode): void;
  (event: 'update:show-archived', value: boolean): void;
  (event: 'search'): void;
}) {
  return (value: string | number | boolean) => {
    const mode = (String(value || 'active') as ArchiveMode);
    emit('update:archive-mode', mode);
    emit('update:show-archived', mode !== 'active');
    emit('search');
  };
}
