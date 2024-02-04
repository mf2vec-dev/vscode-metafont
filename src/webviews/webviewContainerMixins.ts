import * as vscode from 'vscode';

import { ContainerMixin, WebviewManagerConstructor } from './webviewManager';
import * as path from 'path';

/*
a webview can live in:
- a panel
- a view
*/

// eslint-disable-next-line @typescript-eslint/naming-convention
export function PanelWebviewManagerMixin<TBase extends WebviewManagerConstructor>(Base: TBase) {
  abstract class Mixin extends Base implements ContainerMixin {
    webviewPanel: vscode.WebviewPanel;
    visible = false;
    viewColumn?: vscode.ViewColumn;
  
    constructor(...args: any[]) {
      super(...args);
      const webviewPanelTypeId = this.mixinArgs.webviewPanelTypeId || '';
      const webviewPanelTitle = this.mixinArgs.webviewPanelTitle || '';
      this.webviewPanel = vscode.window.createWebviewPanel(
        webviewPanelTypeId,
        webviewPanelTitle,
        vscode.ViewColumn.Beside,
        {retainContextWhenHidden: true}
      );

      this.setUpWebviewWithContainer(this.ctx);
      this.webviewPanel.iconPath = {
        dark: vscode.Uri.file(path.join(this.ctx.extensionPath, 'img', 'ext', 'mf-icon-dark.svg')),
        light: vscode.Uri.file(path.join(this.ctx.extensionPath, 'img', 'ext', 'mf-icon-light.svg'))
      };
  
      this.webviewPanel.onDidDispose(
        () => {
          this.disposables.forEach((disposable: vscode.Disposable) => {
            disposable.dispose();
          });
        },
        undefined,
        this.ctx.subscriptions
      );
    }
    getWebviewContainer() {
      return this.webviewPanel;
    }
    setUpWebviewWithContainer(ctx: vscode.ExtensionContext) {
      this.setUpWebview(ctx);
      const webviewPanel = this.getWebviewContainer()!;
      webviewPanel.onDidChangeViewState(
        (webviewPanelOnDidChangeViewStateEvent: vscode.WebviewPanelOnDidChangeViewStateEvent) => {
          const webviewPanel = webviewPanelOnDidChangeViewStateEvent.webviewPanel;
          const wasVisible = this.visible;
          const sameViewColumn = this.viewColumn === webviewPanel.viewColumn;
          // the view needs to be updated if it becomes visible or if it is moved to a different viewColumn
          if (webviewPanel.visible && (!wasVisible || !sameViewColumn)) {
            // send data to prevent empty view
            this.refreshWebview();
          }
          this.visible = webviewPanel.visible;
          this.viewColumn = webviewPanel.viewColumn;
        },
        undefined,
        this.ctx.subscriptions
      );
    }
  }
  return Mixin;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function ViewWebviewMangerMixin<TBase extends WebviewManagerConstructor>(Base: TBase) {
  abstract class Mixin extends Base implements ContainerMixin {
    geometryPreviewWebviewViewProvider: WebviewViewProvider;

    constructor(...args: any[]) {
      super(...args);
      this.geometryPreviewWebviewViewProvider = new WebviewViewProvider(this, this.ctx);
      const webviewViewId = this.mixinArgs.webviewViewId;
      if (webviewViewId) {
        this.ctx.subscriptions.push(
          vscode.window.registerWebviewViewProvider(
            webviewViewId,
            this.geometryPreviewWebviewViewProvider,
            {webviewOptions: {retainContextWhenHidden: true}}
          )
        );
      };
    }

    getWebviewContainer() {
      return this.geometryPreviewWebviewViewProvider.webviewView;
    }
    setUpWebviewWithContainer(ctx: vscode.ExtensionContext) {
      this.setUpWebview(ctx);
      const webviewView = this.getWebviewContainer()!;
      webviewView.onDidChangeVisibility(
        () => {
          if (webviewView.visible) {
            // send data to prevent empty view
            this.refreshWebview();
          }
        },
        undefined,
        this.ctx.subscriptions
      );
    }
  }
  return Mixin;
}


class WebviewViewProvider implements vscode.WebviewViewProvider {
  ctx: vscode.ExtensionContext;
  webviewView?: vscode.WebviewView;
  manager: InstanceType<ReturnType<typeof ViewWebviewMangerMixin>>;

  constructor(manager: InstanceType<ReturnType<typeof ViewWebviewMangerMixin>>, ctx: vscode.ExtensionContext) {
    this.manager = manager;
    this.ctx = ctx;
  }

  resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext<unknown>, _token: vscode.CancellationToken): void | Thenable<void> {
    this.webviewView = webviewView;
    this.manager.setUpWebviewWithContainer(this.ctx);
  }
}