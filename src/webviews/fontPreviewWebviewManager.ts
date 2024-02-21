// eslint-disable-next-line @typescript-eslint/naming-convention
import * as _ from 'lodash';
import * as vscode from 'vscode';
import { MfFileManager } from '../base/mfFileManager';
import * as types from '../base/types';
import { PreviewGeomItem } from '../base/types';
import {
  BoxLine,
  GeometryPreviewWebviewManager,
  getBoxLines,
  mfPath2PreviewPathData,
  mfPicture2PreviewPicture
} from './geometryPreviewWebviewManager';
import { PanelWebviewManagerMixin, ViewWebviewMangerMixin } from './webviewContainerMixins';
import { FontWebviewManagerMixin } from './webviewInteractionMixins';
import { InteractionSpecificWebviewManager, WebviewMixinArgs } from './webviewManager';

export abstract class FontPreviewWebviewManager extends FontWebviewManagerMixin(GeometryPreviewWebviewManager) implements InteractionSpecificWebviewManager{
  // todo check all methods
  rawPreviewItems: Map<number, types.PreviewItem[]> | undefined = undefined;
  text?: string;
  ligtableKerningLines: types.MfLigtable['kerns'] = [];
  ligtableLigatureLines: types.MfLigtable['ligs'] = [];
  kerning = true;
  ligatures = true;

  constructor(ctx: vscode.ExtensionContext, mixinArgs: WebviewMixinArgs) {
    super(ctx, mixinArgs, 'fontPreview');
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
    let titleBarItems: {[key: string]: any}[] = [
      {
        kind: 'input',
        placeholder: 'text to show...',
        value: this.text,
        messageCommand: 'text' // command is handled by method below
      },
      {
        label: 'features',
        items: [
          {
            kind: 'checkbox',
            label: 'kerning',
            checked: this.kerning,
            messageCommand: 'kerning-checked' // command is handled by method below
          },
          {
            kind: 'checkbox',
            label: 'ligatures',
            checked: this.ligatures,
            messageCommand: 'ligatures-checked' // command is handled by method below
          }
        ]
      }
    ];
    let contentGeneralInfo = {
      contentHeight: 0,
      contentDepth: 0,
      contentLeftWidth: 0,
      contentRightWidth: 0
    };
    let contentGeneralItems: BoxLine[] = [];
    let contentGeometryItems: types.PreviewGeomItem[] = [];
    let rawPreviewItems = this.getData() as Map<number, types.PreviewItem[]> | undefined;
    if (rawPreviewItems !== undefined && this.text !== undefined) {
      const encodedText: number[] = []; 
      for (let i = 0; i < this.text.length; i++) {
        encodedText.push(this.text.charCodeAt(i));
      }

      // ligatures
      for (let i = 0; i < encodedText.length; i++) {
        if (this.ligatures && i < encodedText.length-1) { // no ligature for last char
          while (true) {
            const codePoint = encodedText[i];
            const nextCodePoint = encodedText[i+1];
            const ligatureLine = this.ligtableLigatureLines.findLast((l) => l[0] === codePoint && l[1] === nextCodePoint);
            if (ligatureLine === undefined) {
              break;
            } else {
              const ligaType = ligatureLine[2].split('=:');
              let insertCodePoints: number[] = [];
              if (ligaType[0] === '|') {
                insertCodePoints.push(ligatureLine[0]);
              }
              insertCodePoints.push(ligatureLine[3]);
              if (ligaType[1][0] === '|') {
                insertCodePoints.push(ligatureLine[1]);
              }
              // todo > and >>
              encodedText.splice(i, 2, ...insertCodePoints);
            }
          }
        }
      }

      let xGlyphPos = 0;
      for (let i = 0; i < encodedText.length; i++) {
        const codePoint = encodedText[i];
        // kerning pairs
        if (this.kerning && i > 0) { // no kerning for first char
          const previousCodePoint = encodedText[i-1];
          const kerningLine = this.ligtableKerningLines.findLast((l) => l[0] === previousCodePoint && l[1] === codePoint);
          if (kerningLine) {
            // there is a kerning pair for these glyphs
            const kern = kerningLine[3]; // 3 is kern*hppp
            xGlyphPos += kern;
          }
        }
        if (codePoint === 32) { // space
          xGlyphPos += 50; // todo
          continue;
        }
        const rawCharPreviewItems = _.cloneDeep(rawPreviewItems!.get(codePoint));
        if (rawCharPreviewItems !== undefined) {
          const shipout = rawCharPreviewItems.find(types.isPreviewShipout)!; // there is a shipout since rawPreviewItems is populated on shipouts
          contentGeneralItems.push(...getBoxLines(shipout, 0, xGlyphPos, 0));

          const curGlyphItems = rawCharPreviewItems.map((item) => {
            // todo filter shipout ?
            item = item as PreviewGeomItem; // there is no shipout between shipouts
            item.xoffset = shipout.data.xoffset;
            item.yoffset = shipout.data.yoffset;
            item.xGlyphPos = xGlyphPos;
            item.yGlyphPos = 0;
            return item;
          });
          const previewPicture = shipout.data.picture;
          if (previewPicture !== undefined) {
            previewPicture.xoffset = shipout.data.xoffset;
            previewPicture.yoffset = shipout.data.yoffset;
            previewPicture.xGlyphPos = xGlyphPos;
            previewPicture.yGlyphPos = 0;
            curGlyphItems.push(previewPicture);
          }
          contentGeometryItems.push(...curGlyphItems);

          xGlyphPos += shipout.data.charwd;

          contentGeneralInfo.contentHeight = Math.max(contentGeneralInfo.contentHeight, shipout.data.charht);
          contentGeneralInfo.contentDepth = Math.max(contentGeneralInfo.contentDepth, shipout.data.chardp);
          // Left width is 0.
          contentGeneralInfo.contentRightWidth = xGlyphPos + shipout.data.charic;
        } else {
          // todo insert replacement char
          xGlyphPos += 10;
        }
      }
    }
    this.sendRefreshWithInteraction(titleBarItems, {
      contentGeneralInfo: contentGeneralInfo,
      contentGeneralItems: contentGeneralItems,
      contentItems: contentGeometryItems,
      futureItems: undefined
    });
  }

  handleOtherMessages(message: any) {
    switch (message.command) {
    case 'text':
      // changed value in text input title bar item
      this.text = message.value;
      break;
    case 'kerning-checked':
      this.kerning = message.checked;
      break;
    case 'ligatures-checked':
      this.ligatures = message.checked;
      break;
    }
  }

  runMf() {
    this.rawPreviewItems = new Map<number, types.PreviewItem[]>();
    let rawCharPreviewItems: types.PreviewItem[] = [];
    type PreviousShipoutCmd = {
      line: number;
      filePath: string;
      charcode: number;
      charext: number;
    };
    let previousShipoutCmd: PreviousShipoutCmd | undefined = undefined;
    this.ligtableKerningLines = [];
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
        } else if (types.isMfLigtable(logCmd)) {
          this.ligtableKerningLines.push(...logCmd.kerns);
          this.ligtableLigatureLines.push(...logCmd.ligs);
        }
      },
      [true, true, true] // everything
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

export class FontPreviewWebviewPanelManager extends PanelWebviewManagerMixin(FontPreviewWebviewManager) {
  constructor(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
    super(ctx, {
      webviewPanelTypeId: 'vscode-metafont-font-preview-panel',
      webviewPanelTitle: 'METAFONT Font Preview',
      mfFileManager: mfFileManager
    });
  }
}

export class FontPreviewWebviewViewManager extends ViewWebviewMangerMixin(FontPreviewWebviewManager) {
  constructor(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
    super(ctx, {
      webviewViewId: 'vscode-metafont-font-preview-view',
      mfFileManager: mfFileManager
    });
  }
}
