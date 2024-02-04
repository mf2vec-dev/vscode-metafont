import { readFileSync, writeFile } from 'fs';
import * as vscode from 'vscode';
import { MfFileManager } from './mfFileManager';
import * as types from './types';

export function activateProjectFileManager(ctx: vscode.ExtensionContext) {
  const projectFileManager = new ProjectFileManager();
  projectFileManager.loadProjectFile();
  return projectFileManager;
}

export class ProjectFileManager {
  public mfFileManager: MfFileManager | undefined;

  loadProjectFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.mf-project');
      let jsonStr: string;
      try {
        jsonStr = readFileSync(filePath.fsPath, 'utf8');
      } catch (e: any) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
        return;
      }
      let data: any;
      try {
        data = JSON.parse(jsonStr);
      } catch (jsonErr) {
        console.error('Error parsing .mf-project:', jsonErr);
        return;
      }
      if (this.mfFileManager !== undefined) {
        for (const projectFilMfFile of data.mfFiles) {
          const mfFile = this.mfFileManager.mfFiles.find((f) => projectFilMfFile.path === vscode.workspace.asRelativePath(f.uri));
          if (mfFile !== undefined) {
            mfFile.categoryIds = projectFilMfFile.categoryIds;
          }
        }
        this.mfFileManager.callRefreshCallbacks();
      }
      if (this.mfFileManager !== undefined && data.defaultJobPath !== undefined) {
        this.mfFileManager.setDefaultJobPath(data.defaultJobPath);
      }
      this.updateProjectFile(); // apply changes (e.g. remove files which no longer exist)
    }
  }

  updateProjectFile() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders !== undefined && this.mfFileManager !== undefined) {

      // store only assigned categories in the project file
      // remove all unknown categories and files with only unknown category
      const mfFiles = this.mfFileManager.mfFiles.map((pf) => {
        const categoryIds = pf.categoryIds.filter((cid) => cid !== types.MfFileCategoryId.unknown);
        return {
          path: vscode.workspace.asRelativePath(pf.uri),
          categoryIds: categoryIds
        };
      }).filter((pf) => pf.categoryIds.length > 0);
  
      const jsonStr = JSON.stringify({
        defaultJobPath: this.mfFileManager.defaultJobPath,
        mfFiles: mfFiles
      });
      const filePath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.mf-project');
      writeFile(filePath.fsPath, jsonStr, 'utf8', ()=>{});
    }
  }
}