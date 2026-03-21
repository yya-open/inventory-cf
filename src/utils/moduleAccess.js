import { scopeModeOptions } from './dataScope';
function allowedModes(user) {
    return new Set(scopeModeOptions(user?.data_scope_type, user?.data_scope_value, user?.data_scope_value2));
}
export function canAccessModuleArea(user, area) {
    const modes = allowedModes(user);
    if (area === 'parts')
        return modes.has('parts');
    return modes.has('pc') || modes.has('monitor');
}
export function canAccessPcSection(user, section) {
    const modes = allowedModes(user);
    return modes.has(section);
}
export function preferredPcRoute(user) {
    if (canAccessPcSection(user, 'pc'))
        return '/pc/assets';
    if (canAccessPcSection(user, 'monitor'))
        return '/pc/monitors';
    return '/pc/assets';
}
export function firstAccessibleRoute(user) {
    if (canAccessModuleArea(user, 'parts'))
        return '/stock';
    if (canAccessModuleArea(user, 'pc'))
        return preferredPcRoute(user);
    return '/login';
}
export function firstAccessibleArea(user) {
    return canAccessModuleArea(user, 'parts') ? 'parts' : 'pc';
}
const PARTS_ROUTE_PREFIXES = ['/stock', '/tx', '/warnings', '/in', '/out', '/batch', '/stocktake', '/items', '/import/items'];
const PC_ONLY_ROUTES = new Set(['/pc/assets', '/pc/age-warnings', '/pc/tx', '/pc/inventory-logs', '/pc/in', '/pc/out', '/pc/recycle']);
const MONITOR_ONLY_ROUTES = new Set(['/pc/monitors', '/pc/monitor-tx', '/pc/monitor-inventory-logs']);
export function isPartsModuleRoute(path) {
    return PARTS_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}
export function isPcModuleRoute(path) {
    return path === '/pc' || path.startsWith('/pc/');
}
export function isPcOnlyRoute(path) {
    return PC_ONLY_ROUTES.has(path);
}
export function isMonitorOnlyRoute(path) {
    return MONITOR_ONLY_ROUTES.has(path);
}
