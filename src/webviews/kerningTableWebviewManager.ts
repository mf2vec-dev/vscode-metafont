import * as vscode from 'vscode';
import { MfFileManager } from '../base/mfFileManager';
import * as types from '../base/types';
import { toCharLabel, toMfNumberStr } from '../base/utils';
import { TableWebviewManager } from './tableWebviewManager';
import { ViewWebviewMangerMixin } from './webviewContainerMixins';
import { FontWebviewManagerMixin } from './webviewInteractionMixins';
import { InteractionSpecificWebviewManager } from './webviewManager';

export abstract class KerningTableWebviewManager extends FontWebviewManagerMixin(TableWebviewManager) implements InteractionSpecificWebviewManager {
  tableLines: types.MfLigtable['kerns'] | undefined;
  
  setUpWebview(ctx: vscode.ExtensionContext) {
    super.makeWebviewWithInteraction(ctx);
  }

  refreshWebview() {
    this.startingRefresh();
    this.runMfIfNeeded();
    const kerningTableData = this.tableLines?.map((k) => {
      let char1 = toCharLabel(k[0]);
      let char2 = toCharLabel(k[1]);
      return { char1: char1, char2: char2, kern: toMfNumberStr(k[2]) };
    });
    const columnDefinitions = [
      { columnDataKey: 'char1', title: 'Character 1' },
      { columnDataKey: 'char2', title: 'Character 2' },
      { columnDataKey: 'kern', title: 'Kerning Value' }
    ];
    this.sendRefreshWithInteraction([], kerningTableData, columnDefinitions);
  }

  runMf() {
    this.tableLines = [];
    this.runMfProcessingCmdsWith(
      (logCmd: types.MfCommand) => {
        if (types.isMfLigtable(logCmd)) {
          this.tableLines!.push(...logCmd.kerns);
        }
      },
      [false, false, true]
    );
    this.dirty = false;
  }
}

export class KerningTableWebviewViewManager extends ViewWebviewMangerMixin(KerningTableWebviewManager) {
  constructor(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
    super(ctx, {
      webviewViewId: 'vscode-metafont-kerning-table-view',
      mfFileManager: mfFileManager
    });
  }
}
