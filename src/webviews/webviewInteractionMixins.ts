import * as vscode from 'vscode';
import * as types from '../base/types';

import { activeMfFileAbsPath, activeMfFileLineNumber } from '../extension';
import { MfFileManager } from '../base/mfFileManager';
import { ContentSpecificWebviewManagerConstructor, InteractionMixin } from './webviewManager';
import * as path from 'path';
import { runMfForPreview } from './previewMfRunner';

/*
There are three kinds of file interaction of webviews:\
- file independent webviews\
  used for debugger, gets content directly from debugger\
- font webviews, requiring a first line and a job file\
  content refers to the whole font, e.g. ligtable, font preview\
- selection webviews, requiring a first line, a job file and a active file
  (including selection)\
  content refers to the current selection, e.g. the character/glyph currently
  edited
*/

// todo don't run mf multiple times for same file / first line

export let fileWebviewManagers: (
  InstanceType<ReturnType<typeof FontWebviewManagerMixin>>
  | InstanceType<ReturnType<typeof SelectionWebviewManagerMixin>>
)[] = [];

export function refreshAllFileWebviews() {
  for (const fileWebviewManager of fileWebviewManagers) {
    fileWebviewManager.runMf();
    fileWebviewManager.refreshWebview();
  }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function FileIndependentWebviewManagerMixin<TBase extends ContentSpecificWebviewManagerConstructor>(Base: TBase) {
  abstract class Mixin extends Base implements InteractionMixin {
    handleOtherMessages?(message: any): void;
    makeWebviewWithInteraction(ctx: vscode.ExtensionContext) {
      this.makeWebview(ctx);
      this.webview = this.webview!;

      this.webview.onDidReceiveMessage(
        this.receiveMessageListener,
        this,
        this.ctx.subscriptions
      );
    }
    sendRefreshWithInteraction(titleBarItems: {[key: string]: any}[], ...args: any) {
      // no special title bar items to add for file independent webview
      this.sendRefresh(titleBarItems, ...args);
    }
    receiveMessageListener(message: any) {
      if (this.handleOtherMessages) {
        this.handleOtherMessages(message);
        this.refreshWebview();
      }
    }
  }
  return Mixin;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function FontWebviewManagerMixin<TBase extends ContentSpecificWebviewManagerConstructor>(Base: TBase) {
  abstract class Mixin extends FileIndependentWebviewManagerMixin(Base) implements InteractionMixin {
    static activeEditor = 'active file';
    static defaultJob = 'default job';
    jobFilePathSelection: string = Mixin.defaultJob;
    firstLine = '';
    mfFileManager: MfFileManager;

    constructor(...args: any[]) {
      super(...args);
      if (this.mixinArgs.mfFileManager === undefined) {
        throw new Error('Missing mixinArg: mfFileManager');
      }
      this.mfFileManager = this.mixinArgs.mfFileManager;
      fileWebviewManagers.push(this);
    }

    refreshCheckOnSelectionChange() { // to be customized by extending mixins
      return true;
    }

    getSelectedJobFilePath() {
      switch (this.jobFilePathSelection) {
      case Mixin.activeEditor:
        return activeMfFileAbsPath;
      case Mixin.defaultJob:
        return this.mfFileManager.defaultJobPath;
      default:
        return this.jobFilePathSelection;
      };
    }

    makeWebviewWithInteraction(ctx: vscode.ExtensionContext) {
      super.makeWebview(ctx);
      this.webview = this.webview!;
  
      this.webview.onDidReceiveMessage(
        this.receiveMessageListener,
        this,
        this.ctx.subscriptions
      );

      this.disposables.push(
        vscode.workspace.onDidChangeTextDocument(
          (textDocumentChangeEvent) => {
            if (textDocumentChangeEvent.document.languageId === 'metafont') {
              const dirtyStateChanged = textDocumentChangeEvent.contentChanges.length === 0 && textDocumentChangeEvent.reason === undefined;
              if (dirtyStateChanged && !textDocumentChangeEvent.document.isDirty) {
                // document was saved
                this.dirty = true;
                this.refreshWebview();
              }
            }
          },
          undefined,
          this.ctx.subscriptions
        )
      );
      this.disposables.push(
        vscode.window.onDidChangeActiveTextEditor(
          (textEditor) => {
            if (textEditor && textEditor.document.languageId === 'metafont' && this.refreshCheckOnSelectionChange()) {
              // this.jobFilePathSelection = textEditor.document.fileName; // todo needed ?
              this.dirty = true;
              this.refreshWebview();
            }
          },
          undefined,
          this.ctx.subscriptions
        )
      );
    }
    sendRefreshWithInteraction(titleBarItems: {[key: string]: any}[], ...args: any) {
      titleBarItems.push({
        label: 'first\xA0line',
        kind: 'input',
        placeholder: 'e.\u202Fg. mode := \u2026;',
        value: this.firstLine,
        messageCommand: 'first-line'
      });
  
      // job
      const dropDownOptions: { label: string; selected?: boolean; disabled?: boolean; }[] = [
        { label: Mixin.activeEditor, selected: this.jobFilePathSelection === Mixin.activeEditor },
        { label: '--------', disabled: true },
        { label: Mixin.defaultJob, selected: this.jobFilePathSelection === Mixin.defaultJob },
        { label: '--------', disabled: true }
      ];
      const sortedMfFiles = [...this.mfFileManager.mfFiles].sort(this.mfFileManager.sortFilesByUri);
      for (const mfFile of sortedMfFiles) {
        if (mfFile.categoryIds.includes(types.MfFileCategoryId.param)) {
          let uriStr = vscode.workspace.asRelativePath(mfFile.uri);
          dropDownOptions.push(
            { label: uriStr, selected: this.jobFilePathSelection === uriStr }
          );
        }
      }
      dropDownOptions.push(
        { label: '(Drag & drop files into ', disabled: true },
        { label: '\xA0\xA0the parameter files group', disabled: true },
        { label: '\xA0\xA0in the METAFONT Files View', disabled: true },
        { label: '\xA0\xA0to list them here)', disabled: true },
        { label: '--------', disabled: true }
      );
      // todo add all other files
      titleBarItems.push({
        label: 'job',
        kind: 'dropdown',
        options: dropDownOptions,
        messageCommand: 'job'
      });
      this.sendRefresh(titleBarItems, ...args);
    }

    runMfIfNeeded() {
      if (this.dirty) {
        this.runMf();
      }
    }

    abstract runMf(): void;

    runMfProcessingCmdsWith(processCmd: (logCmd: types.MfCommand) => void, runMfArgs: any[] = []) {
      let jobFilePath = this.getSelectedJobFilePath();
      if (jobFilePath) {
        const workspacePath = vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath; // todo extension-wide
        if (workspacePath) {
          jobFilePath = path.resolve(workspacePath, jobFilePath);
        }
        const logCmds = runMfForPreview(jobFilePath, this.firstLine, ...runMfArgs);
        for (const logCmd of logCmds) {
          processCmd(logCmd);
        }
      }
    }
  
    receiveMessageListener(message: any) {
      switch (message.command) {
      case 'first-line':
        this.firstLine = message.value;
        this.reset(); // reset to force MF run
        break;
      case 'job':
        this.jobFilePathSelection = message.selection;
        this.reset(); // reset to force MF run
        break;
      default:
        if (this.handleOtherMessages) {
          this.handleOtherMessages(message);
        }
        break;
      }
      this.refreshWebview();
    }
  };
  return Mixin;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export function SelectionWebviewManagerMixin<TBase extends ContentSpecificWebviewManagerConstructor>(Base: TBase) {
  abstract class Mixin extends FontWebviewManagerMixin(Base) implements InteractionMixin {
    previewFilePathSelection: string = Mixin.activeEditor;
    previewFileLineNumber?: number;
    locked: false | {absPath: string, lineNumber: number} = false;
    refreshCheckOnSelectionChange() {
      return !this.locked;
    };
    // no need to listen to changed selection etc. as this is done by the extension
    receiveMessageListener(message: any) {
      switch (message.command) {
      case 'first-line':
        this.firstLine = message.value;
        this.reset();
        break;
      case 'job':
        this.jobFilePathSelection = message.selection;
        this.reset();
        break;
      case 'show-lock':
        if (activeMfFileAbsPath && activeMfFileLineNumber) {
          this.locked = {
            absPath: activeMfFileAbsPath,
            lineNumber: activeMfFileLineNumber
          };
        }
        break;
      case 'show-unlock':
        this.locked = false;
        break;
      default:
        if (this.handleOtherMessages) {
          this.handleOtherMessages(message);
        }
        break;
      }
      this.refreshWebview();
    }
    sendRefreshWithInteraction(titleBarItems: {[key: string]: any}[] = [], contentGeneralInfo?: {[key: string]: any}, contentGeneralItems?: {[key: string]: any}[], contentItems?: {[key: string]: any}[], futureContentItems?: {[key: string]: any}[]): void {
      // first line
      titleBarItems.push({
        label: 'first\xA0line',
        kind: 'input',
        placeholder: 'e.\u202Fg. mode := \u2026;',
        value: this.firstLine,
        messageCommand: 'first-line'
      });
  
      // job
      const dropDownOptions: { label: string; selected?: boolean; disabled?: boolean; }[] = [
        { label: Mixin.activeEditor, selected: this.jobFilePathSelection === Mixin.activeEditor },
        { label: '--------', disabled: true },
        { label: Mixin.defaultJob, selected: this.jobFilePathSelection === Mixin.defaultJob },
        { label: '--------', disabled: true }
      ];
      for (const mfFile of this.mfFileManager.mfFiles) {
        if (mfFile.categoryIds.includes(types.MfFileCategoryId.param)) {
          let uriStr = vscode.workspace.asRelativePath(mfFile.uri);
          dropDownOptions.push(
            { label: uriStr, selected: this.jobFilePathSelection === uriStr }
          );
        }
      }
      dropDownOptions.push(
        { label: '(Drag & drop files into ', disabled: true },
        { label: '\xA0\xA0the parameter files group', disabled: true },
        { label: '\xA0\xA0in the METAFONT Files View', disabled: true },
        { label: '\xA0\xA0to list them here)', disabled: true },
        { label: '--------', disabled: true }
      );
      // todo add all other files
      titleBarItems.push({
        label: 'job',
        kind: 'dropdown',
        options: dropDownOptions,
        messageCommand: 'job'
      });
  
      // show
      const showItems: {}[] = [];
      showItems.push({
        kind: 'button-icon',
        icon: 'unlock',
        messageCommand: 'show-unlock',
        toggled: !this.locked
      });
      showItems.push({
        kind: 'button-icon',
        icon: 'lock',
        messageCommand: 'show-lock',
        toggled: this.locked
      });
      if (this.locked && this.previewFileLineNumber) {
        showItems.push({
          kind: 'data',
          value: this.previewFileLineNumber.toString() // todo file path
        });
      }
      titleBarItems.push({
        label: 'show',
        items: showItems
      });
  
      super.sendRefresh(titleBarItems, contentGeneralInfo, contentGeneralItems, contentItems, futureContentItems);
    }
    makeWebviewWithInteraction(ctx: vscode.ExtensionContext): void {
      super.makeWebviewWithInteraction(ctx);
      this.disposables.push(
        vscode.window.onDidChangeTextEditorSelection(
          (textEditorSelectionChangeEvent) => {
            if (textEditorSelectionChangeEvent.textEditor.document.languageId === 'metafont' && this.refreshCheckOnSelectionChange()) {
              this.refreshWebview();
            }
          },
          undefined,
          this.ctx.subscriptions
        )
      );
    }
  };
  return Mixin;
}