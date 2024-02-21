import * as vscode from 'vscode';
import { MfFileManager } from '../base/mfFileManager';
import * as types from '../base/types';
import { PreviewGeomItem } from '../base/types';
import { toMfNumberStr as toMfNumStr } from '../base/utils';
import { activeMfFileAbsPath, activeMfFileLineNumber } from '../extension';
import {
  GeometryPreviewWebviewManager, getBoxLines, mfPath2PreviewPathData, mfPicture2PreviewPicture
} from './geometryPreviewWebviewManager';
import { PanelWebviewManagerMixin, ViewWebviewMangerMixin } from './webviewContainerMixins';
import { SelectionWebviewManagerMixin } from './webviewInteractionMixins';
import { InteractionSpecificWebviewManager, WebviewMixinArgs } from './webviewManager';

export abstract class GlyphPreviewWebviewManager extends SelectionWebviewManagerMixin(GeometryPreviewWebviewManager) implements InteractionSpecificWebviewManager{
  rawPreviewItems: types.PreviewItem[] |undefined = undefined;

  constructor(ctx: vscode.ExtensionContext, mixinArgs: WebviewMixinArgs) {
    super(ctx, mixinArgs, 'glyphPreview');
  }

  setUpWebview(ctx: vscode.ExtensionContext) {
    this.makeWebviewWithInteraction(ctx);
  }

  atStartup() {
    this.activatePreviewOptions();
    this.updatePreviewOptionsFromConfiguration();
  }

  refreshWebview() {
    this.startingRefresh();
    this.runMfIfNeeded();
    let titleBarItems: {[key: string]: any}[] = [];
    let contentGeneralInfo;
    let contentGeneralItems;
    let aboveCursorItems;
    let belowCursorItems;
    let rawPreviewItems = (this.getData() as types.PreviewItem[] | undefined);
    if (rawPreviewItems !== undefined) {
      const shipouts = rawPreviewItems.filter(types.isPreviewShipout);
      const lineNumber = this.locked ? this.locked.lineNumber : activeMfFileLineNumber;
      const absPath = this.locked ? this.locked.absPath : activeMfFileAbsPath;
      if (absPath !== undefined && lineNumber !== undefined) {
        let previousShipout: types.PreviewShipout | undefined;
        let nextShipout: types.PreviewShipout | undefined;
        if (shipouts.length > 0) {
          previousShipout = shipouts.findLast((d) => d.filePath === absPath && d.line < lineNumber);
          nextShipout = shipouts.find((d) => d.filePath === absPath && d.line >= lineNumber);
          if (nextShipout !== undefined) {
            titleBarItems.push(
              {
                kind: 'value',
                label: 'charcode',
                value: toMfNumStr(nextShipout.data.charcode)
              },
              {
                kind: 'value',
                label: 'charext',
                value: toMfNumStr(nextShipout.data.charext)
              },
              {
                kind: 'value',
                label: 'charwd',
                value: toMfNumStr(nextShipout.data.charwd)
              },
              {
                kind: 'value',
                label: 'charht',
                value: toMfNumStr(nextShipout.data.charht)
              },
              {
                kind: 'value',
                label: 'chardp',
                value: toMfNumStr(nextShipout.data.chardp)
              },
              {
                kind: 'value',
                label: 'charic',
                value: toMfNumStr(nextShipout.data.charic)
              },
              {
                kind: 'value',
                label: 'xoffset',
                value: toMfNumStr(nextShipout.data.xoffset)
              },
              {
                kind: 'value',
                label: 'yoffset',
                value: toMfNumStr(nextShipout.data.yoffset)
              }
            );
            const previewPicture = nextShipout.data.picture;
            if (previewPicture !== undefined) {
              previewPicture.xoffset = nextShipout.data.xoffset;
              previewPicture.yoffset = nextShipout.data.yoffset;
            }
            contentGeneralInfo = {
              contentHeight: nextShipout.data.charht,
              contentDepth: nextShipout.data.chardp,
              contentLeftWidth: 0,
              contentRightWidth: nextShipout.data.charwd + nextShipout.data.charic,
              contentPicture: previewPicture
            };

            contentGeneralItems = getBoxLines(nextShipout);
            let curGlyphItems = rawPreviewItems.filter((d) => previousShipout ? d.line > previousShipout.line : true); // true: first glyph before first shipout
            curGlyphItems = curGlyphItems.filter((d) => d.line <= nextShipout!.line);  // false: ignore after last shipout
            curGlyphItems = curGlyphItems.map((item) => {
              item = item as PreviewGeomItem; // there is no shipout between shipouts
              item.xoffset = nextShipout!.data.xoffset;
              item.yoffset = nextShipout!.data.yoffset;
              item.xGlyphPos = 0; // todo can this be omitted here?
              item.yGlyphPos = 0;
              return item;
            });
            aboveCursorItems = curGlyphItems.filter((d) => d.filePath === absPath && d.line <= lineNumber);
            belowCursorItems = curGlyphItems.filter((d) => d.filePath === absPath && d.line > lineNumber);
          }
        }
      } else if (shipouts.length === 1) {
        // If the cursor position is unknown, only show everything if there is exactly one shipout.
        aboveCursorItems = this.rawPreviewItems;
      }
    }
    this.sendRefreshWithInteraction(titleBarItems, {
      contentGeneralInfo: contentGeneralInfo,
      contentGeneralItems: contentGeneralItems,
      contentItems: aboveCursorItems,
      futureItems: belowCursorItems
    });
  }

  runMf() {
    this.rawPreviewItems = [];
    this.runMfProcessingCmdsWith(
      (logCmd: types.MfCommand) => {
        if (types.isMfPath(logCmd)) {
          let previewPath = mfPath2PreviewPathData(logCmd);
          this.rawPreviewItems!.push({ line: logCmd.line, filePath: logCmd.filePath, type: 'Bezier', data: previewPath, xoffset: 0, yoffset: 0, xGlyphPos: 0, yGlyphPos: 0 });
        } else if (types.isMfLabel(logCmd)) {
          this.rawPreviewItems!.push({ line: logCmd.line, filePath: logCmd.filePath, type: 'Label', data: { mid: [logCmd.x, logCmd.y], text: logCmd.text , pos: logCmd.pos }, xoffset: 0, yoffset: 0, xGlyphPos: 0, yGlyphPos: 0 });
        } else if (types.isMfShipout(logCmd)) {
          let picture: types.PreviewPicture | undefined;
          if (logCmd.picture !== undefined) {
            picture = mfPicture2PreviewPicture(logCmd.picture);
          }
          this.rawPreviewItems!.push({
            line: logCmd.line,
            filePath: logCmd.filePath,
            type: 'shipout',
            data: {
              charcode: logCmd.charcode,
              charext: logCmd.charext,
              charwd: logCmd.charwd,
              charht: logCmd.charht,
              chardp: logCmd.chardp,
              charic: logCmd.charic,
              xoffset: logCmd.xoffset,
              yoffset: logCmd.yoffset,
              picture: picture
            }
          });
        }
      },
      [] // default is correct
    );
    this.dirty = false;
  }
}

export class GlyphPreviewWebviewPanelManager extends PanelWebviewManagerMixin(GlyphPreviewWebviewManager) {
  constructor(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
    super(ctx, {
      webviewPanelTypeId: 'vscode-metafont-glyph-preview-panel',
      webviewPanelTitle: 'METAFONT Glyph Preview',
      mfFileManager: mfFileManager
    });
  }
}

export class GlyphPreviewWebviewViewManager extends ViewWebviewMangerMixin(GlyphPreviewWebviewManager) {
  constructor(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
    super(ctx, {
      webviewViewId: 'vscode-metafont-glyph-preview-view',
      mfFileManager: mfFileManager
    });
  }
}
