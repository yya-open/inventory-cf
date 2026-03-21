export const PERMISSION_LABEL = {
    system_settings_write: '系统配置修改',
    audit_export: '审计导出',
    asset_purge: '彻底删除资产',
    bulk_operation: '批量操作',
    stocktake_apply: '应用盘点',
    ops_tools: '运维工具',
    async_job_manage: '异步任务中心',
};
export const PERMISSION_TEMPLATE_LABEL = {
    admin_full: '管理员-完全权限',
    admin_ops: '管理员-运维模板',
    operator_plus: '操作员-增强模板',
    auditor: '审计员模板',
    readonly: '只读模板',
};
export const PERMISSION_TEMPLATE_DEFAULTS = {
    admin_full: {
        system_settings_write: true,
        audit_export: true,
        asset_purge: true,
        bulk_operation: true,
        stocktake_apply: true,
        ops_tools: true,
        async_job_manage: true,
    },
    admin_ops: {
        system_settings_write: false,
        audit_export: true,
        asset_purge: false,
        bulk_operation: true,
        stocktake_apply: true,
        ops_tools: true,
        async_job_manage: true,
    },
    operator_plus: {
        system_settings_write: false,
        audit_export: false,
        asset_purge: false,
        bulk_operation: true,
        stocktake_apply: false,
        ops_tools: false,
        async_job_manage: false,
    },
    auditor: {
        system_settings_write: false,
        audit_export: true,
        asset_purge: false,
        bulk_operation: false,
        stocktake_apply: false,
        ops_tools: false,
        async_job_manage: false,
    },
    readonly: {
        system_settings_write: false,
        audit_export: false,
        asset_purge: false,
        bulk_operation: false,
        stocktake_apply: false,
        ops_tools: false,
        async_job_manage: false,
    },
};
export const ALL_PERMISSION_CODES = Object.keys(PERMISSION_LABEL);
export const ALL_PERMISSION_TEMPLATE_CODES = Object.keys(PERMISSION_TEMPLATE_LABEL);
export function getDefaultPermissionTemplate(role) {
    if (role === 'admin')
        return 'admin_full';
    if (role === 'operator')
        return 'operator_plus';
    return 'readonly';
}
export function normalizePermissionTemplateCode(role, templateCode) {
    return (templateCode && ALL_PERMISSION_TEMPLATE_CODES.includes(templateCode)
        ? templateCode
        : getDefaultPermissionTemplate(role));
}
export function buildTemplatePermissionMap(role, templateCode) {
    const code = normalizePermissionTemplateCode(role, templateCode);
    return { ...PERMISSION_TEMPLATE_DEFAULTS[code] };
}
export function hasPermission(user, code) {
    if (!user)
        return false;
    if (user.role === 'admin' && (!user.permission_template_code || user.permission_template_code === 'admin_full'))
        return true;
    return !!user.permissions?.[code];
}
