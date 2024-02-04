import * as vscode from 'vscode';

import * as types from '../base/types';
import { toCharLabel } from '../base/utils';
import {
  GeometryPreviewWebviewManager, getBoxLines, mfPath2PreviewPathData, mfPicture2PreviewPicture
} from './geometryPreviewWebviewManager';
import { PanelWebviewManagerMixin, ViewWebviewMangerMixin } from './webviewContainerMixins';
import { FontWebviewManagerMixin } from './webviewInteractionMixins';
import { InteractionSpecificWebviewManager } from './webviewManager';
import { PreviewGeomItem } from '../base/types';
import { MfFileManager } from '../base/mfFileManager';

export abstract class GlyphOverviewWebviewManager extends FontWebviewManagerMixin(GeometryPreviewWebviewManager) implements InteractionSpecificWebviewManager{
  rawPreviewItems: Map<number, types.PreviewItem[]> | undefined = undefined;
  multiGeometry = true; // overwrite GeometryPreviewWebviewManager default
  setUpWebview(ctx: vscode.ExtensionContext) {
    this.makeWebviewWithInteraction(ctx);
  }

  refreshWebview() {
    this.startingRefresh();
    this.runMfIfNeeded();
    const refreshData: any[] = [];
    let rawPreviewItems = (this.getData() as Map<number, types.PreviewItem[]> | undefined);
    if (rawPreviewItems !== undefined) {
      for (let i = 0; i < Math.max(...[...rawPreviewItems!.keys()])+1; i++) {
        const rawCharPreviewItems = rawPreviewItems!.get(i);
        if (rawCharPreviewItems !== undefined) {
          const shipout = rawCharPreviewItems.find(types.isPreviewShipout)!; // there is a shipout since rawPreviewItems is populated on shipouts
          
          const previewPicture = shipout.data.picture;
          if (previewPicture !== undefined) {
            previewPicture.xoffset = shipout.data.xoffset;
            previewPicture.yoffset = shipout.data.yoffset;
          }
          const contentGeneralInfo = {
            contentHeight: shipout.data.charht,
            contentDepth: shipout.data.chardp,
            contentLeftWidth: 0,
            contentRightWidth: shipout.data.charwd + shipout.data.charic,
            contentPicture: previewPicture,
            contentLabel: toCharLabel(shipout.data.charcode)
          };
          const contentGeneralItems = getBoxLines(shipout, 0); 
          const curGlyphItems = rawCharPreviewItems.map((item) => {
            // todo filter shipout ?
            item = item as PreviewGeomItem; // there is no shipout between shipouts
            item.xoffset = shipout.data.xoffset;
            item.yoffset = shipout.data.yoffset;
            item.xGlyphPos = 0;
            item.yGlyphPos = 0;
            return item;
          });
          refreshData.push({
            contentGeneralInfo: contentGeneralInfo,
            contentGeneralItems: contentGeneralItems,
            contentItems: curGlyphItems,
            futureItems: undefined
          });
        }
      }
    }
    this.sendRefreshWithInteraction([], refreshData);
  }

  runMf() {
    this.rawPreviewItems = new Map<number, types.PreviewItem[]>();
    let rawCharPreviewItems: types.PreviewItem[] = [];
    type PreviousShipoutCmd = {
      line: number,
      filePath: string,
      charcode: number,
      charext: number
    };
    let previousShipoutCmd: PreviousShipoutCmd | undefined = undefined;
    this.runMfProcessingCmdsWith(
      (logCmd: types.MfCommand) => {
        if (previousShipoutCmd !== undefined && (previousShipoutCmd.line !== logCmd.line || previousShipoutCmd.filePath !== logCmd.filePath)) {
          // line of shipout ended before logCmd (shipout's line needs to be finished since endchar has box rules after shipit)
          this.rawPreviewItems!.set(previousShipoutCmd.charcode + 256*previousShipoutCmd.charext, rawCharPreviewItems);
          rawCharPreviewItems = [];
          previousShipoutCmd = undefined;
        }
        if (types.isMfPath(logCmd)) {
          let previewPath = mfPath2PreviewPathData(logCmd);
          rawCharPreviewItems.push({ line: logCmd.line, filePath: logCmd.filePath, type: 'Bezier', data: previewPath, xoffset: 0, yoffset: 0, xGlyphPos: 0, yGlyphPos: 0 });
        } else if (types.isMfLabel(logCmd)) {
          rawCharPreviewItems.push({ line: logCmd.line, filePath: logCmd.filePath, type: 'Label', data: { mid: [logCmd.x, logCmd.y], text: logCmd.text , pos: logCmd.pos }, xoffset: 0, yoffset: 0, xGlyphPos: 0, yGlyphPos: 0 });
        } else if (types.isMfShipout(logCmd)) {
          let picture: types.PreviewPicture | undefined;
          if (logCmd.picture !== undefined) {
            picture = mfPicture2PreviewPicture(logCmd.picture);
          }
          rawCharPreviewItems.push({
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
          previousShipoutCmd = {
            line: logCmd.line,
            filePath: logCmd.filePath,
            charcode: logCmd.charcode,
            charext: logCmd.charext
          };
        }
      },
      []
    );
    // last char
    if (previousShipoutCmd !== undefined) {
      previousShipoutCmd = previousShipoutCmd as PreviousShipoutCmd;
      // line of shipout ended before logCmd (shipout's line needs to be finished since endchar has box rules after shipit)
      this.rawPreviewItems!.set(previousShipoutCmd.charcode + 256*previousShipoutCmd.charext, rawCharPreviewItems);
    }
    this.dirty = false;
  }
}

export class GlyphOverviewWebviewPanelManager extends PanelWebviewManagerMixin(GlyphOverviewWebviewManager) {
  constructor(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
    super(ctx, {
      webviewPanelTypeId: 'vscode-metafont-glyph-overview-panel',
      webviewPanelTitle: 'METAFONT Glyph Overview',
      mfFileManager: mfFileManager
    });
  }
  atStartup() {
    this.activatePreviewOptions();
  }
}

export class GlyphOverviewWebviewViewManager extends ViewWebviewMangerMixin(GlyphOverviewWebviewManager) {
  constructor(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
    super(ctx, {
      webviewViewId: 'vscode-metafont-glyph-overview-view',
      mfFileManager: mfFileManager
    });
  }
  atStartup() {
    this.activatePreviewOptions();
  }
}
