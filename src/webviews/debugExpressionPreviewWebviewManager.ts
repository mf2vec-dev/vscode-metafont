import * as vscode from 'vscode';

import { debugAdapterFactory } from '../extension';
import { parsePathString, parsePictureString } from './previewMfRunner';
import * as types from '../base/types';
import {
  GeometryPreviewWebviewManager, mfPath2PreviewPathData, mfPicture2PreviewPicture
} from './geometryPreviewWebviewManager';
import { ViewWebviewMangerMixin } from './webviewContainerMixins';
import { FileIndependentWebviewManagerMixin } from './webviewInteractionMixins';
import { InteractionSpecificWebviewManager } from './webviewManager';

// Unfortunately, vscode doesn't expose contributes.menus for watch view (there is no debug/watch/context).

export abstract class DebugExpressionPreviewWebviewManager extends FileIndependentWebviewManagerMixin(GeometryPreviewWebviewManager) implements InteractionSpecificWebviewManager {
  expr?: string;
  setUpWebview(ctx: vscode.ExtensionContext) {
    this.makeWebviewWithInteraction(ctx);
    this.webview = this.webview!;
  }
  async refreshWebview() {
    this.startingRefresh();
    const session = vscode.debug.activeDebugSession;
    if (session) {
      let previewItems: types.PreviewItem[] = [];
      if (this.expr) {
        const mfDebugSession = debugAdapterFactory.debugSessions[session.id];
        const result = await mfDebugSession.mfDebugWrapper.evaluateExpression(this.expr);
        if (result.kind === 'value' && result.type) {
          const line = 0;
          const curFilePath = '';
          if (result.type === 'path') {
            const mfPath = parsePathString(result.content, line, curFilePath);
            if (mfPath) {
              const previewPath = mfPath2PreviewPathData(mfPath);
              previewItems.push({ line: line, filePath: curFilePath, type: 'Bezier', data: previewPath, xoffset: 0, yoffset: 0, xGlyphPos: 0, yGlyphPos: 0 });
            }
          } else if (result.type === 'picture') {
            const mfPicture = parsePictureString(result.content, line, curFilePath);
            if (mfPicture) {
              const previewPicture = mfPicture2PreviewPicture(mfPicture);
              previewItems.push(previewPicture);
            }
          } // only paths and pictures supported
        }
      }
      this.sendRefreshItems(previewItems);
    }
  }
  sendRefreshItems(previewItems: {[key: string]: any}[]) {
    let titleBarItems = [{
      kind: 'input',
      placeholder: 'expression...',
      value: this.expr,
      messageCommand: 'expr' // command is handled by method below
    }];
    this.sendRefreshWithInteraction(titleBarItems, undefined, undefined, previewItems, undefined);
  }
  handleOtherMessages(message: any) {
    switch (message.command) {
    case 'expr':
      // changed value in expr input title bar item
      this.expr = message.value;
      break;
    }
  }
}

export class DebugExpressionPreviewWebviewViewManager extends ViewWebviewMangerMixin(DebugExpressionPreviewWebviewManager) {
  constructor(ctx: vscode.ExtensionContext) {
    super(ctx, {webviewViewId: 'vscode-metafont-debug-expression-preview-view'});
  }
}
