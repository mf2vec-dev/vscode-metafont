import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { MfFileManager } from '../base/mfFileManager';

/**
general class structure for webview manager:
+           webview manager (WebviewManager) OK
  +         content type specific subclass (geometry or table) (ContentTypeSpecificWebviewManager) OK
    +       file interaction mixin (InteractionMixin) OK
    | +     subclass using file interaction mixin (InteractionSpecificWebviewManager)
    |   +   container mixin (ContainerMixin) OK
    |   | + subclass using container mixin

+   |   |   makeWebviewFromHtml           - set options, html path, paths of other resources
  + |   |   makeWebview !                 - calls makeWebviewFromHtml with html file name
    +   |   makeWebviewWithInteraction  ! - ! needs to add file interaction specific listeners
    | + |   setUpWebview !                - 
    |   +   setUpWebviewWithContainer !   - ! needs to add container specific listeners
    |   | + (none)                        - (none)

+   |   |   postRefresh                   - posts data as `'refresh'`
  + |   |   sendRefresh !                 - calls postRefresh with data as expected from html
    +   |   sendRefreshWithInteraction !  - ! needs to add file interaction specific title bar items
      + |   refreshWebview !              - 
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


Details:
- WebviewManager
  implementing makeWebviewFromHtml and postRefresh methods
  requiring abstract methods getWebviewContainer, sendRefresh, refreshWebview, makeWebview, setUpWebview
- WebviewManager is subclassed by content-specific webview managers
  - GeometryPreviewWebviewManager
  - TableWebviewManager
  Each of them
  - implements
  - can be used with file interaction mixins FontWebviewManagerMixin or SelectionWebviewManagerMixin
    Each of those Mixins
- The subclasses and the subclasses with mixins
  - implement ...
  - should be used with container mixins PanelWebviewManagerMixin or ViewWebviewMangerMixin
- The container mixins implement
  - WebviewManager's abstract method getWebviewContainer
  - setUpWebview method which
    - calls makeWebview of the subclasses or the mixins
    - register a callback which calls refreshWebview method when needed

So the hierarchy of creating a webview is (definition):
- setUpWebview - container mixins
  - add listener to refresh based on container type (e.g. visibility)
    - listeners call ...
- setUpWebview - subclasses with content-specific mixins
  - 
- makeWebview - content-specific mixins
  - add listener to refresh based on file interactivity (e.g. active file)
    - listeners call ...
- makeWebview - subclasses
  - call makeWebviewFromHtml with html file name
- makeWebviewFromHtml - WebviewManager
  - set options, html path, paths of other resources

And the hierarchy of updating a webview is:
- refreshWebview - 
- sendRefresh
- postRefresh - WebviewManager
*/

export type ContentSpecificWebviewManagerConstructor = abstract new (...args: any[]) => ContentTypeSpecificWebviewManager;
export type WebviewManagerConstructor = abstract new (...args: any[]) => WebviewManager;
type WebviewContainer = vscode.WebviewPanel | vscode.WebviewView;

type WebviewMixinArgs = {
  webviewViewId?: string,
  webviewPanelTypeId?: string,
  webviewPanelTitle?: string
  mfFileManager?: MfFileManager
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
  data?: any
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