import * as vscode from 'vscode';
import { ContentTypeSpecificWebviewManager, WebviewManager } from './webviewManager';

export abstract class TableWebviewManager extends WebviewManager implements ContentTypeSpecificWebviewManager {
  abstract tableLines: any[][] | undefined;
  makeWebview(ctx: vscode.ExtensionContext) {
    this.makeWebviewFromHtml(ctx, 'tableWebview');
  }

  sendRefresh(titleBarItems: {[key: string]: any}[] = [], tableData?: {[key: string]: any}[], columnDefinitions?: {[key: string]: any}[]) {
    this.postRefresh({
      titleBarItems: titleBarItems,
      tableData: tableData,
      columnDefinitions: columnDefinitions
    });
  }
  getData() {
    return this.tableLines;
  }
  reset() {
    this.dirty = true;
  }
}
