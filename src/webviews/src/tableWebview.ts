import { setStatusIcon, updateTitleBar } from "./webview";

const titleBar = document.getElementById('title-bar')!;
const dataGrid = document.getElementById('data-grid') as any;

window.addEventListener('message', (e) => {
  const message = e.data;
  switch (message.command) {
  case 'refresh':
    updateTitleBar(titleBar, message.data.titleBarItems);
    dataGrid.rowsData = message.data.tableData;
    dataGrid.columnDefinitions = message.data.columnDefinitions;
    break;
  case 'set-status':
    setStatusIcon(message.data);
    break;
  }
});

