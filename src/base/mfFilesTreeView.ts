import * as path from 'node:path';
import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { MfInputsRequestArgs, MfInputsResponse } from '../language/server';
import { refreshAllFileWebviews } from '../webviews/webviewInteractionMixins';
import { MfFileManager } from './mfFileManager';
import * as types from './types';

export function activateMfFilesView(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager, languageClient: LanguageClient) {
  const mfFilesTreeDataProvider = new MfFilesTreeDataProvider(mfFileManager, languageClient);
  mfFileManager.refreshCallbacks.push(() => mfFilesTreeDataProvider.refresh()); // arrow function otherwise this get lost in refresh

  // initial fill with all .mf files
  mfFileManager.refreshFromFiles();
  const mfFilesDecorationProvider = new MfFilesDecorationProvider(mfFileManager);
  ctx.subscriptions.push(vscode.window.registerFileDecorationProvider(mfFilesDecorationProvider));
  mfFileManager.mfFilesDecorationProvider = mfFilesDecorationProvider;

  const mfFilesViewOptions: vscode.TreeViewOptions<types.MfFileOrCategory> = {
    canSelectMany: true,
    dragAndDropController: new MfFilesDragAndDropController(mfFilesTreeDataProvider),
    showCollapseAll: true,
    treeDataProvider: mfFilesTreeDataProvider,
  };
  const mfFilesView = vscode.window.createTreeView('vscode-metafont-metafont-files-tree', mfFilesViewOptions);
  ctx.subscriptions.push(mfFilesView);
}

export class MfFilesDecorationProvider {
  readonly _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter< vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;
  constructor(public mfFileManager: MfFileManager) {}
  provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken) {
    if (this.mfFileManager.defaultJobPath !== undefined && uri.fsPath === this.mfFileManager.defaultJobPath) {
      const fileDecoration: vscode.FileDecoration = {
        badge: "🏠", // codicon not supported
        propagate: true,
        tooltip: "Default job"
      };
      return fileDecoration;
    }
  }
}

class MfFilesTreeDataProvider implements vscode.TreeDataProvider<types.MfFileOrCategory> {
  constructor(public mfFileManager: MfFileManager, public languageClient: LanguageClient) {}
  async getChildren(element: types.MfFileOrCategory): Promise<types.MfFileOrCategory[]> {
    if (!element) {
      return MfFileManager.mfFileCategories;
    }
    if (types.isMfFileCategory(element)) {
      let children = this.mfFileManager.mfFiles.filter((f) => f.categoryIds.includes(element.id));
      children.sort(this.mfFileManager.sortFilesByUri);
      return children;
    }

    const args: MfInputsRequestArgs = { uri: element.uri.toString() };
    const response: MfInputsResponse = await this.languageClient.sendRequest('MfInputsRequest', args);
    if (types.isMfFile(element)) {
      return [
        ...response.inputs.map((input) => {
          return { uri: vscode.Uri.parse(input.uri), parentUri: element.uri, inputtedBy: false };
        }).sort(compareInputs),
        ...response.inputtedBy.map((input) => {
          return { uri: vscode.Uri.parse(input.uri), parentUri: element.uri, inputtedBy: true };
        }).sort(compareInputs)
      ];
    }
    // if already a MfFileInput, keep the kind of MfFileInput.
    if (element.inputtedBy) {
      return response.inputtedBy.map((input) => {
        return { uri: vscode.Uri.parse(input.uri), parentUri: element.uri, inputtedBy: true };
      }).sort(compareInputs);
    }
    return response.inputs.map((input) => {
      return { uri: vscode.Uri.parse(input.uri), parentUri: element.uri, inputtedBy: false };
    }).sort(compareInputs);
  }

  async getTreeItem(element: types.MfFileOrCategory): Promise<vscode.TreeItem> {
    if (types.isMfFileCategory(element)) {
      const numChildren = (await this.getChildren(element)).length;
      return {
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        description: '(' + numChildren + ')',
        label: element.label
      };
    }
    if (types.isMfFileInput(element)) {
      let tooltip: string;
      if (element.inputtedBy) {
        tooltip = `${path.basename(element.parentUri.fsPath)} is inputted by ${path.basename(element.uri.fsPath)}`;
      } else {
        tooltip = `${path.basename(element.parentUri.fsPath)} is inputting ${path.basename(element.uri.fsPath)}`;
      }
      return {
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        description: true,
        resourceUri: element.uri,
        iconPath: new vscode.ThemeIcon(element.inputtedBy ? 'indent' : 'newline'),
        tooltip: tooltip,
        command: {
          title: 'Open',
          command: 'vscode.open',
          arguments: [element.uri]
        }
      };
    }
    return {
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      description: true,
      resourceUri: element.uri,
      contextValue: 'mfFile',
      command: {
        title: 'Open',
        command: 'vscode.open',
        arguments: [element.uri]
      }
    };
  }

  // refresh
  private readonly _onDidChangeTreeData: vscode.EventEmitter<types.MfFileOrCategory | undefined | null | void> = new vscode.EventEmitter<types.MfFileOrCategory | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<types.MfFileOrCategory | undefined | null | void> = this._onDidChangeTreeData.event;
  refresh() {
    this._onDidChangeTreeData.fire();
    // refresh all previews to update job dropdown
    refreshAllFileWebviews();
  }
};

class MfFilesDragAndDropController implements vscode.TreeDragAndDropController<types.MfFile> {
  dragMimeTypes = [];
  dropMimeTypes = ['application/vnd.code.tree.vscode-metafont-metafont-files-tree'];
  dragged: vscode.Uri[] = [];
  constructor(public mfFilesTreeDataProvider: MfFilesTreeDataProvider) {}
  handleDrag(source: readonly types.MfFileOrCategory[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
    for (const s of source) {
      if (types.isMfFile(s)) {
        this.dragged.push(s.uri);
      }
    }
  };

  handleDrop(target: types.MfFileOrCategory | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
    if (target && types.isMfFileCategory(target)) {
      this.mfFilesTreeDataProvider.mfFileManager.setCategoryIds(this.dragged, [target.id]);
      this.dragged = [];
      this.mfFilesTreeDataProvider.refresh();
    }
  };
};

function compareInputs(a: types.MfFile | types.MfFileInput, b: types.MfFile | types.MfFileInput) {
  if (a.uri < b.uri) {
    return -1;
  }
  if (a.uri > b.uri) {
    return 1;
  }
  return 0;
}
