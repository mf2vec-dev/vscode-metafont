import * as vscode from 'vscode';
import { MfFileManager } from '../base/mfFileManager';
import * as types from '../base/types';
import { toCharLabel } from '../base/utils';
import { TableWebviewManager } from './tableWebviewManager';
import { ViewWebviewMangerMixin } from './webviewContainerMixins';
import { FontWebviewManagerMixin } from './webviewInteractionMixins';
import { InteractionSpecificWebviewManager } from './webviewManager';

export abstract class LigatureTableWebviewManager extends FontWebviewManagerMixin(TableWebviewManager) implements InteractionSpecificWebviewManager {
  tableLines: [number, number, string, number][] | undefined;

  setUpWebview(ctx: vscode.ExtensionContext) {
    super.makeWebviewWithInteraction(ctx);
  }

  refreshWebview() {
    this.startingRefresh();
    this.runMfIfNeeded();
    const ligatureTableData = this.tableLines?.map((l) => {
      let char1 = toCharLabel(l[0]);
      let char2 = toCharLabel(l[1]);
      let ligChar = toCharLabel(l[3]);
      return { char1: char1, char2: char2, ligType: l[2], ligChar: ligChar };
    });
    const columnDefinitions = [
      { columnDataKey: 'char1', title: 'Character 1' },
      { columnDataKey: 'char2', title: 'Character 2' },
      { columnDataKey: 'ligType', title: 'Ligature Type' },
      { columnDataKey: 'ligChar', title: 'Inserted Character' }
    ];
    this.sendRefreshWithInteraction([], ligatureTableData, columnDefinitions);
  }

  runMf() {
    this.tableLines = [];
    this.runMfProcessingCmdsWith(
      (logCmd: types.MfCommand) => {
        if (types.isMfLigtable(logCmd)) {
          this.tableLines!.push(...logCmd.ligs);
        }
      },
      [false, false, true]
    );
    this.dirty = false;
  }
}

export class LigatureTableWebviewViewManager extends ViewWebviewMangerMixin(LigatureTableWebviewManager) {
  constructor(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
    super(ctx, {
      webviewViewId: 'vscode-metafont-ligature-table-view',
      mfFileManager: mfFileManager
    });
  }
}
