import { ElMessageBox } from "element-plus";

export async function promptDangerConfirm(expected: string, title = "二次确认") {
  const { value } = await ElMessageBox.prompt(
    `请输入「${expected}」确认操作（区分大小写）`,
    title,
    {
      type: "warning",
      confirmButtonText: "确认",
      cancelButtonText: "取消",
      inputPlaceholder: expected,
      inputValidator: (v: string) => (String(v || "").trim() === expected ? true : `需要输入「${expected}」`),
    }
  );
  return String(value || "").trim();
}

export async function chooseClearMode(options: {
  title: string;
  hasFilter: boolean;
  filteredText: string;
  allText: string;
}) {
  const { title, hasFilter, filteredText, allText } = options;
  const action = await ElMessageBox.confirm(
    hasFilter ? `${filteredText}\n\n如果你要清空全部记录，请点『清空全部』。` : `${allText}\n\n此操作不可恢复，请谨慎！`,
    title,
    {
      type: "warning",
      confirmButtonText: hasFilter ? "清空当前筛选" : "确认清空全部",
      cancelButtonText: hasFilter ? "清空全部" : "取消",
      distinguishCancelAndClose: true,
    }
  ).then(
    () => (hasFilter ? "filtered" : "all"),
    (reason) => {
      if (reason === "cancel" && hasFilter) return "all";
      return null;
    }
  );
  return action as "filtered" | "all" | null;
}
