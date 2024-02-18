import {
  provideVSCodeDesignSystem,
  vsCodeBadge,
  vsCodeButton,
  vsCodeCheckbox,
  vsCodeDataGrid,
  vsCodeDataGridCell,
  vsCodeDataGridRow,
  vsCodeDivider,
  vsCodeDropdown,
  vsCodePanelTab,
  vsCodePanelView,
  vsCodePanels,
  vsCodeTag,
  vsCodeTextField
} from '@vscode/webview-ui-toolkit';

provideVSCodeDesignSystem().register(
  vsCodeBadge(),
  vsCodeButton(),
  vsCodeCheckbox(),
  vsCodeDataGrid(),
  vsCodeDataGridCell(),
  vsCodeDataGridRow(),
  vsCodeDivider(),
  vsCodeDropdown(),
  vsCodePanelTab(),
  vsCodePanelView(),
  vsCodePanels(),
  vsCodeTag(),
  vsCodeTextField()
);
