import * as vscode from 'vscode';
import { MfFileManager } from '../base/mfFileManager';
import * as types from '../base/types';
import { toCharLabel, toMfNumberStr } from '../base/utils';
import { TableWebviewManager } from './tableWebviewManager';
import { ViewWebviewMangerMixin } from './webviewContainerMixins';
import { FontWebviewManagerMixin } from './webviewInteractionMixins';
import { InteractionSpecificWebviewManager } from './webviewManager';

export abstract class GlyphTableWebviewManager extends FontWebviewManagerMixin(TableWebviewManager) implements InteractionSpecificWebviewManager {
  tableLines: [char: number, wd: number, ht: number, dp: number, ic: number][] = [];

  setUpWebview(ctx: vscode.ExtensionContext) {
    this.makeWebviewWithInteraction(ctx);
  }

  refreshWebview() {
    this.startingRefresh();
    this.runMfIfNeeded();
    const glyphTableData = this.tableLines.map((g) => {
      return {
        char: toCharLabel(g[0]),
        wd: toMfNumberStr(g[1]),
        ht: toMfNumberStr(g[2]),
        dp: toMfNumberStr(g[3]),
        ic: toMfNumberStr(g[4])
      };
    });
    const columnDefinitions = [
      { columnDataKey: 'char', title: 'Character' },
      { columnDataKey: 'wd', title: 'Width' },
      { columnDataKey: 'ht', title: 'Height' },
      { columnDataKey: 'dp', title: 'Depth' },
      { columnDataKey: 'ic', title: 'Italic correction' }
    ];
    this.sendRefreshWithInteraction([], glyphTableData, columnDefinitions);
  }

  runMf() {
    this.tableLines = [];
    this.runMfProcessingCmdsWith(
      (logCmd: types.MfCommand) => {
        if (types.isMfShipout(logCmd)) {
          this.tableLines!.push([
            logCmd.charcode + 256*logCmd.charext,
            logCmd.charht,
            logCmd.charwd,
            logCmd.chardp,
            logCmd.charic,
          ]);
        }
      },
      []
    );
    this.dirty = false;
  }
}

export class GlyphTableWebviewViewManager extends ViewWebviewMangerMixin(GlyphTableWebviewManager) {
  constructor(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
    super(ctx, {
      webviewViewId: 'vscode-metafont-glyph-table-view',
      mfFileManager: mfFileManager
    });
  }
}
