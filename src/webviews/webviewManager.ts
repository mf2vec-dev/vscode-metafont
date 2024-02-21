import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MfFileManager } from '../base/mfFileManager';

/*
general class structure for webview manager:
+           webview manager (WebviewManager)
  +         content type specific subclass (geometry or table) (ContentTypeSpecificWebviewManager)
    +       file interaction mixin (InteractionMixin)
    | +     subclass using file interaction mixin (InteractionSpecificWebviewManager)
    |   +   container mixin (ContainerMixin)
    |   | + subclass using container mixin

+   |   |   makeWebviewFromHtml           - set options, html path, paths of other resources
  + |   |   makeWebview                   - calls makeWebviewFromHtml with html file name
    +   |   makeWebviewWithInteraction    - ! needs to add file interaction specific listeners
    | + |   setUpWebview                  - 
    |   +   setUpWebviewWithContainer     - ! needs to add container specific listeners
    |   | + (none)                        - (none)

+   |   |   postRefresh                   - posts data as `'refresh'`
  + |   |   sendRefresh                   - calls postRefresh with data as expected from html
    +   |   sendRefreshWithInteraction    - ! needs to add file interaction specific title bar items
      + |   refreshWebview                - 
        +   (none)                        - (no container specific refresh needed)
          + (none)                        - (none)

Class structure for Webviews:
- WebviewManager
  - GeometryPreviewWebviewManager
      - FileGeometryPreviewWebviewManager using SelectionWebviewManagerMixin
          - FileGeometryPreviewWebviewPanelManager using PanelWebviewManagerMixin
          - FileGeometryPreviewWebviewViewManager using ViewWebviewMangerMixin
      - DebugExpressionPreviewWebviewManager using FileIndependentWebviewManagerMixin
          - DebugExpressionPreviewWebviewViewManager using ViewWebviewMangerMixin
  - TableWebviewManager
      - KerningTableWebviewManager using FontWebviewManagerMixin
          - KerningTableWebviewViewManager using ViewWebviewMangerMixin
      - LigatureTableWebviewManager using FontWebviewManagerMixin
          - LigatureTableWebviewViewManager using ViewWebviewMangerMixin
*/

export type ContentSpecificWebviewManagerConstructor = abstract new (...args: any[]) => ContentTypeSpecificWebviewManager;
export type WebviewManagerConstructor = abstract new (...args: any[]) => WebviewManager;
type WebviewContainer = vscode.WebviewPanel | vscode.WebviewView;

export type WebviewMixinArgs = {
  webviewViewId?: string;
  webviewPanelTypeId?: string;
  webviewPanelTitle?: string;
  mfFileManager?: MfFileManager;
};

export interface ContainerMixin {
  getWebviewContainer(): WebviewContainer | undefined;
  setUpWebviewWithContainer(ctx: vscode.ExtensionContext): void;
};
export interface InteractionSpecificWebviewManager extends ContentTypeSpecificWebviewManager {
  setUpWebview(ctx: vscode.ExtensionContext): void;
  refreshWebview(): void;
};
export interface InteractionMixin {
  makeWebviewWithInteraction(ctx: vscode.ExtensionContext): void;
  sendRefreshWithInteraction(...args: any): void;
};
export interface ContentTypeSpecificWebviewManager extends WebviewManager{
  makeWebview(ctx: vscode.ExtensionContext): void;
  sendRefresh(...args: any): void;
  reset(): void;
  getData(): any | undefined;
};

type WebviewMessage = {
  command: string;
  data?: any;
};
enum WebviewStatus {
  ok = 'ok',
  dirty = 'dirty',
  waiting = 'waiting'
}

export abstract class WebviewManager {
  webview?: vscode.Webview;
  mixinArgs: WebviewMixinArgs;
  ctx: vscode.ExtensionContext;
  disposables: vscode.Disposable[] = [];
  dirty = true;

  constructor(ctx: vscode.ExtensionContext, mixinArgs: WebviewMixinArgs) {
    this.ctx = ctx;
    this.mixinArgs = mixinArgs;
  }

  abstract getWebviewContainer(): WebviewContainer | undefined;

  abstract setUpWebviewWithContainer(ctx: vscode.ExtensionContext): void;
  abstract setUpWebview(ctx: vscode.ExtensionContext): void;
  abstract makeWebview(ctx: vscode.ExtensionContext): void;
  abstract makeWebviewWithInteraction(ctx: vscode.ExtensionContext): void;
  makeWebviewFromHtml(ctx: vscode.ExtensionContext, fileName: string, jsFileName?: string) {
    if (jsFileName === undefined) {
      jsFileName = fileName;
    }
    const container = this.getWebviewContainer()!; // this method is called when preview container is defined
    this.webview = container.webview;
    this.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(ctx.extensionUri, 'out', 'webviews', 'src'),
        vscode.Uri.joinPath(ctx.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist')
      ]
    };

    this.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
        case 'loaded':
          this.atStartup();
          break;
        }
      },
      this,
      ctx.subscriptions
    );

    const htmlUri = vscode.Uri.file(path.join(ctx.extensionPath, 'out', 'webviews', 'src', `${fileName}.html`));
    const webviewCssUri = this.webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'out', 'webviews', 'src', `webview.css`));
    const cssUri = this.webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'out', 'webviews', 'src', `${fileName}.css`));
    const registerWebviewUiToolkitJsUri = this.webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'out', 'webviews', 'src', 'registerWebviewUiToolkit.js'));
    const codiconCssUri = this.webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'));
    const jsUri = this.webview.asWebviewUri(vscode.Uri.joinPath(ctx.extensionUri, 'out', 'webviews', 'src', `${jsFileName}.js`));
    this.webview.html = fs.readFileSync(htmlUri.fsPath, 'utf8')
      .replace('${webview.css}', webviewCssUri.toString())
      .replace(`\${${fileName}.css}`, cssUri.toString())
      .replace('${registerWebviewUiToolkit.js}', registerWebviewUiToolkitJsUri.toString())
      .replace('${codicon.css}', codiconCssUri.toString())
      .replace(`\${${fileName}.js}`, jsUri.toString());

    this.refreshWebview();
  }

  atStartup() { } // can be overridden by subclass

  abstract refreshWebview(): void;
  abstract sendRefreshWithInteraction(titleBarItems: any, ...args: any): void;
  abstract sendRefresh(titleBarItems: any, ...args: any): void;
  postRefresh(data: {[key: string]: any}) {
    this.postMessage({
      command: 'refresh',
      data: data
    });
    this.setStatus(WebviewStatus.ok);
  }

  startingRefresh() {
    this.setStatus(WebviewStatus.waiting);
  }
  setStatus(status: WebviewStatus) {
    // todo why does it take so long until the webview callback is called?
    this.postMessage({
      command: 'set-status',
      data: status
    });
  }

  postMessage(message: WebviewMessage) {
    const webviewContainer = this.getWebviewContainer();
    if (webviewContainer) {
      webviewContainer.webview.postMessage(message);
    }
  }
}