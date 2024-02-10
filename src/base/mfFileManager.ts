import * as vscode from 'vscode';
import { MfFilesDecorationProvider } from './mfFilesTreeView';
import { ProjectFileManager } from './projectFileManager';
import * as types from './types';

export async function activateMfFileManager(ctx: vscode.ExtensionContext, projectFileManager: ProjectFileManager) {
  const mfFileManager = new MfFileManager(ctx, projectFileManager);
  await mfFileManager.asyncInit();
  vscode.commands.registerCommand('vscode-metafont.refresh-metafont-files-tree-data', () => mfFileManager.refreshFromFiles());
  return mfFileManager;
}

export class MfFileManager {
  defaultJobPath: string | undefined;
  mfFilesDecorationProvider: MfFilesDecorationProvider | undefined;
  static mfFileUnknownCategory: types.MfFileCategory = { label: 'unknown category', id: types.MfFileCategoryId.unknown };
  static mfFileKnownCategories: types.MfFileCategory[] = [
    { label: 'base files', id: types.MfFileCategoryId.base },
    { label: 'parameter files', id: types.MfFileCategoryId.param },
    { label: 'driver files', id: types.MfFileCategoryId.driver },
    { label: 'program files', id: types.MfFileCategoryId.program }
  ];
  static mfFileCategories: types.MfFileCategory[] = [
    ...MfFileManager.mfFileKnownCategories, 
    MfFileManager.mfFileUnknownCategory
  ];
  mfFiles: types.MfFile[] = [];
  ctx: vscode.ExtensionContext;
  refreshCallbacks: (() => void)[] = [];

  constructor(ctx: vscode.ExtensionContext, public projectFileManager: ProjectFileManager) {
    this.ctx = ctx;

    // watch created and deleted .mf files
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.mf', false, true, false);
    watcher.onDidCreate(
      (uri) => {
        this.mfFiles.push({ uri: uri, categoryIds: [types.MfFileCategoryId.unknown] });
        this.projectFileManager.updateProjectFile(); // todo required here?
        this.callRefreshCallbacks();
      },
      undefined,
      ctx.subscriptions
    );
    watcher.onDidDelete(
      (uri) => {
        const deletedMfFileIndex = this.mfFiles.findIndex((file) => file.uri ? file.uri === uri : false);
        this.mfFiles.splice(deletedMfFileIndex, 1);
        this.projectFileManager.updateProjectFile();
        this.callRefreshCallbacks();
      },
      undefined,
      ctx.subscriptions
    );

    ctx.subscriptions.push(
      vscode.commands.registerCommand(
        'vscode-metafont.set-as-default-job',
        (mfFile: types.MfFile) => this.setDefaultJobPath(mfFile.uri.fsPath)
      )
    );
  
    ctx.subscriptions.push(
      vscode.commands.registerCommand(
        'vscode-metafont.get-default-job',
        () => this.defaultJobPath
      )
    );
  }
  async asyncInit() { // constructor cannot be async
    await this.refreshFromFiles();
  }

  async refreshFromFiles() {
    const uris = await vscode.workspace.findFiles('**/*.mf');
    this.mfFiles = [];
    for (const uri of uris) {
      this.mfFiles.push({ uri: uri, categoryIds: [types.MfFileCategoryId.unknown] });
    }
    this.projectFileManager.loadProjectFile();
    this.callRefreshCallbacks();
  }

  async callRefreshCallbacks() {
    
    this.refreshCallbacks.forEach((callback) => callback());
  }

  setCategoryIds(uris: vscode.Uri[], ids: types.MfFileCategoryId[]) {
    // remove unknown from ids it is not the only category
    if (ids.length !== 1 && !ids.includes(types.MfFileCategoryId.unknown)) {
      ids = ids.filter((id) => id !== types.MfFileCategoryId.unknown);
    }
    // apply ids
    for (const uri of uris) {
      const mfFile = this.mfFiles.find((f) => uri === f.uri);
      if (mfFile !== undefined) {
        mfFile.categoryIds = ids;
      }
    }
    this.projectFileManager.updateProjectFile();
  }

  sortFilesByUri(f1: types.MfFile, f2: types.MfFile) {
    if (f1.uri < f2.uri) {
      return -1;
    }
    if (f1.uri > f2.uri) {
      return 1;
    }
    return 0;
  }

  setDefaultJobPath(path: string) {
    if (this.defaultJobPath !== undefined) {
      this.mfFilesDecorationProvider?._onDidChangeFileDecorations.fire(vscode.Uri.file(this.defaultJobPath)); // remove old
    }
    this.defaultJobPath = path;
    this.mfFilesDecorationProvider?._onDidChangeFileDecorations.fire(vscode.Uri.file(this.defaultJobPath)); // set new
    this.projectFileManager.updateProjectFile();
  }
}