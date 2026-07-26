export const TABLE_LABEL: Record<string, string> = {
  warehouses: "仓库",
  items: "配件",
  stock: "stock",
  categories: "分类",
  stock_tx: "出入库明细",
  stocktake: "盘点单",
  stocktake_line: "盘点明细",
  audit_log: "审计日志",
  auth_login_throttle: "登录限流",
  public_api_throttle: "公共接口限流",
  users: "用户",
  pc_assets: "电脑台账",
  pc_in: "电脑入库记录",
  pc_out: "电脑出库记录",
  pc_recycle: "电脑回收/归还记录",
  pc_scrap: "电脑报废记录",
  pc_inventory_log: "电脑盘点记录",
  pc_locations: "位置表",
  monitor_assets: "显示器台账",
  monitor_tx: "显示器出入库明细",
  monitor_inventory_log: "显示器盘点记录",
};

export function tableCn(t: string) {
  return TABLE_LABEL[t] || t;
}

export function tableGroupKey(t: string) {
  if (["warehouses","items","categories","stock","stock_tx","stocktake","stocktake_line"].includes(t)) return "parts";
  if (t.startsWith("pc_")) return "pc";
  if (t.startsWith("monitor_") || ["monitor_assets","monitor_tx","monitor_inventory_log"].includes(t)) return "monitor";
  return "system";
}

export function tableGroupLabel(key: string) {
  return key === "parts" ? "配件仓" : (key === "pc" ? "电脑仓" : (key === "monitor" ? "显示器" : "系统表"));
}