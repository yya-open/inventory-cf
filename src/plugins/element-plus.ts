import type { App, Component } from 'vue';
import { defineAsyncComponent } from 'vue';
import { ElAlert } from 'element-plus/es/components/alert/index';
import { ElAside, ElContainer, ElHeader, ElMain } from 'element-plus/es/components/container/index';
import { ElButton, ElButtonGroup } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElDialog } from 'element-plus/es/components/dialog/index';
import { ElDrawer } from 'element-plus/es/components/drawer/index';
import { ElEmpty } from 'element-plus/es/components/empty/index';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElLoading } from 'element-plus/es/components/loading/index';
import { ElMenu, ElMenuItem } from 'element-plus/es/components/menu/index';
import { ElTag } from 'element-plus/es/components/tag/index';

import 'element-plus/es/components/alert/style/css';
import 'element-plus/es/components/aside/style/css';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/button-group/style/css';
import 'element-plus/es/components/card/style/css';
import 'element-plus/es/components/checkbox/style/css';
import 'element-plus/es/components/checkbox-group/style/css';
import 'element-plus/es/components/collapse/style/css';
import 'element-plus/es/components/collapse-item/style/css';
import 'element-plus/es/components/col/style/css';
import 'element-plus/es/components/container/style/css';
import 'element-plus/es/components/date-picker/style/css';
import 'element-plus/es/components/descriptions/style/css';
import 'element-plus/es/components/descriptions-item/style/css';
import 'element-plus/es/components/dialog/style/css';
import 'element-plus/es/components/divider/style/css';
import 'element-plus/es/components/dropdown/style/css';
import 'element-plus/es/components/dropdown-item/style/css';
import 'element-plus/es/components/dropdown-menu/style/css';
import 'element-plus/es/components/drawer/style/css';
import 'element-plus/es/components/empty/style/css';
import 'element-plus/es/components/form/style/css';
import 'element-plus/es/components/form-item/style/css';
import 'element-plus/es/components/header/style/css';
import 'element-plus/es/components/icon/style/css';
import 'element-plus/es/components/input/style/css';
import 'element-plus/es/components/input-number/style/css';
import 'element-plus/es/components/loading/style/css';
import 'element-plus/es/components/main/style/css';
import 'element-plus/es/components/menu/style/css';
import 'element-plus/es/components/menu-item/style/css';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import 'element-plus/es/components/option/style/css';
import 'element-plus/es/components/option-group/style/css';
import 'element-plus/es/components/pagination/style/css';
import 'element-plus/es/components/popconfirm/style/css';
import 'element-plus/es/components/progress/style/css';
import 'element-plus/es/components/radio/style/css';
import 'element-plus/es/components/radio-button/style/css';
import 'element-plus/es/components/radio-group/style/css';
import 'element-plus/es/components/row/style/css';
import 'element-plus/es/components/scrollbar/style/css';
import 'element-plus/es/components/select/style/css';
import 'element-plus/es/components/segmented/style/css';
import 'element-plus/es/components/skeleton/style/css';
import 'element-plus/es/components/step/style/css';
import 'element-plus/es/components/steps/style/css';
import 'element-plus/es/components/switch/style/css';
import 'element-plus/es/components/tab-pane/style/css';
import 'element-plus/es/components/tabs/style/css';
import 'element-plus/es/components/table/style/css';
import 'element-plus/es/components/table-column/style/css';
import 'element-plus/es/components/tag/style/css';
import 'element-plus/es/components/upload/style/css';

const coreComponents = [
  ElAlert,
  ElAside,
  ElButton,
  ElButtonGroup,
  ElCard,
  ElContainer,
  ElDialog,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElInput,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElTag,
] as const;

const asyncComponents: Record<string, () => Promise<Component>> = {
  ElCheckbox: () => import('element-plus/es/components/checkbox/index').then((module) => module.ElCheckbox),
  ElCheckboxGroup: () => import('element-plus/es/components/checkbox/index').then((module) => module.ElCheckboxGroup),
  ElCol: () => import('element-plus/es/components/col/index').then((module) => module.ElCol),
  ElDatePicker: () => import('element-plus/es/components/date-picker/index').then((module) => module.ElDatePicker),
  ElDescriptions: () => import('element-plus/es/components/descriptions/index').then((module) => module.ElDescriptions),
  ElDescriptionsItem: () => import('element-plus/es/components/descriptions/index').then((module) => module.ElDescriptionsItem),
  ElInputNumber: () => import('element-plus/es/components/input-number/index').then((module) => module.ElInputNumber),
  ElOption: () => import('element-plus/es/components/select/index').then((module) => module.ElOption),
  ElOptionGroup: () => import('element-plus/es/components/select/index').then((module) => module.ElOptionGroup),
  ElPagination: () => import('element-plus/es/components/pagination/index').then((module) => module.ElPagination),
  ElProgress: () => import('element-plus/es/components/progress/index').then((module) => module.ElProgress),
  ElRow: () => import('element-plus/es/components/row/index').then((module) => module.ElRow),
  ElSelect: () => import('element-plus/es/components/select/index').then((module) => module.ElSelect),
  ElSkeleton: () => import('element-plus/es/components/skeleton/index').then((module) => module.ElSkeleton),
  ElSwitch: () => import('element-plus/es/components/switch/index').then((module) => module.ElSwitch),
  ElTable: () => import('element-plus/es/components/table/index').then((module) => module.ElTable),
  ElTableColumn: () => import('element-plus/es/components/table/index').then((module) => module.ElTableColumn),
};

export function installElementPlus(app: App) {
  const loadingDirective = (ElLoading as any)?.directive;
  if (loadingDirective) app.directive('loading', loadingDirective);
  coreComponents.forEach((component) => {
    if (component.name) app.component(component.name, component);
  });
  Object.entries(asyncComponents).forEach(([name, loader]) => {
    app.component(name, defineAsyncComponent(loader));
  });
}
