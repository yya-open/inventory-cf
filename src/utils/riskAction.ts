import { ElMessageBox } from './el-services';

export type RiskConfirmInput = {
  title: string;
  actionLabel: string;
  riskLevel?: 'warning' | 'danger';
  affectedRows?: number;
  detail?: string;
  irreversible?: boolean;
};

export async function confirmRiskAction(input: RiskConfirmInput) {
  const lines = [
    `即将执行：${input.actionLabel}`,
    input.affectedRows != null ? `预计影响：${input.affectedRows} 条记录` : '',
    input.irreversible ? '类型：高风险，执行后可能不可逆' : '类型：高风险，请确认影响范围后再继续',
    input.detail || '',
  ].filter(Boolean);
  await ElMessageBox.confirm(lines.join('\n'), input.title, {
    type: input.riskLevel === 'danger' ? 'error' : 'warning',
    confirmButtonText: `确认${input.actionLabel}`,
    cancelButtonText: '取消',
  });
}
