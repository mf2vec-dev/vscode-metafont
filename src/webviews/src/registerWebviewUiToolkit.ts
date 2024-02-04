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
  vsCodePanels,
  vsCodePanelTab,
  vsCodePanelView,
  vsCodeTextField,
  vsCodeTag
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
  vsCodePanels(),
  vsCodePanelTab(),
  vsCodePanelView(),
  vsCodeTextField(),
  vsCodeTag()
);
