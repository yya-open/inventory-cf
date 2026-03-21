import type { App } from 'vue';
import {
  ElAlert,
  ElAside,
  ElButton,
  ElButtonGroup,
  ElCard,
  ElCheckbox,
  ElCheckboxGroup,
  ElCol,
  ElContainer,
  ElDatePicker,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDivider,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElLoading,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElPopover,
  ElPopconfirm,
  ElProgress,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElRow,
  ElScrollbar,
  ElSegmented,
  ElSelect,
  ElSkeleton,
  ElSwitch,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
  ElUpload,
} from 'element-plus';

import 'element-plus/es/components/alert/style/css';
import 'element-plus/es/components/aside/style/css';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/button-group/style/css';
import 'element-plus/es/components/card/style/css';
import 'element-plus/es/components/checkbox/style/css';
import 'element-plus/es/components/checkbox-group/style/css';
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
import 'element-plus/es/components/pagination/style/css';
import 'element-plus/es/components/popover/style/css';
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
import 'element-plus/es/components/switch/style/css';
import 'element-plus/es/components/tab-pane/style/css';
import 'element-plus/es/components/table/style/css';
import 'element-plus/es/components/table-column/style/css';
import 'element-plus/es/components/tabs/style/css';
import 'element-plus/es/components/tag/style/css';
import 'element-plus/es/components/upload/style/css';

const components = [
  ElAlert,
  ElAside,
  ElButton,
  ElButtonGroup,
  ElCard,
  ElCheckbox,
  ElCheckboxGroup,
  ElCol,
  ElContainer,
  ElDatePicker,
  ElDescriptions,
  ElDescriptionsItem,
  ElDialog,
  ElDivider,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElInput,
  ElInputNumber,
  ElMain,
  ElMenu,
  ElMenuItem,
  ElOption,
  ElPagination,
  ElPopover,
  ElPopconfirm,
  ElProgress,
  ElRadio,
  ElRadioButton,
  ElRadioGroup,
  ElRow,
  ElScrollbar,
  ElSegmented,
  ElSelect,
  ElSkeleton,
  ElSwitch,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
  ElTag,
  ElUpload,
] as const;

export function installElementPlus(app: App) {
  const loadingDirective = (ElLoading as any)?.directive;
  if (loadingDirective) app.directive('loading', loadingDirective);
  components.forEach((component) => {
    if (component.name) app.component(component.name, component);
  });
}
