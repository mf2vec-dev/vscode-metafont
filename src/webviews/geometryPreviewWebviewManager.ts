import * as vscode from 'vscode';
import * as types from '../base/types';
import { ContentTypeSpecificWebviewManager, WebviewManager, WebviewMixinArgs } from './webviewManager';

export type PreviewOption = {
  option: string;
  checked: boolean;
};

export abstract class GeometryPreviewWebviewManager extends WebviewManager implements ContentTypeSpecificWebviewManager {
  rawPreviewItems: types.PreviewItem[] | Map<number, types.PreviewItem[]> | undefined = undefined;
  multiGeometry = false;
  configurationSection: string;

  constructor(ctx: vscode.ExtensionContext, mixinArgs: WebviewMixinArgs, configurationSection: string) {
    super(ctx, mixinArgs);
    this.configurationSection = configurationSection;
    vscode.workspace.onDidChangeConfiguration((configurationChangeEvent) => this.updatePreviewOptionsFromConfiguration(configurationChangeEvent));
  }

  reset() {
    this.dirty = true;
  }
  getData() {
    return this.rawPreviewItems;
  }
  makeWebview(ctx: vscode.ExtensionContext) {
    let jsFile = 'singleGeometryWebview';
    if (this.multiGeometry) {
      jsFile = 'multiGeometryWebview';
    }
    this.makeWebviewFromHtml(ctx, 'geometryWebview', jsFile);
  }
  
  activatePreviewOptions() {
    this.postMessage({
      command: 'activate-preview-options'
    });
  }

  updateMultiPreviewSizeFromConfiguration() {
    const glyphOverviewConfiguration = vscode.workspace.getConfiguration('vscode-metafont.previews.geometry.glyphOverview');
    this.setMultiPreviewSize(
      glyphOverviewConfiguration.get('previewHeight') || 150,
      glyphOverviewConfiguration.get('previewWidthMin') || 150
    );
  }

  setMultiPreviewSize(height: number, widthMin: number) {
    this.postMessage({
      command: 'set-multi-preview-size',
      data: {
        height: height+'px',
        widthMin: widthMin+'px'
      }
    });
  }

  updatePreviewOptionsFromConfiguration(configurationChangeEvent: vscode.ConfigurationChangeEvent | undefined = undefined) {
    const previewOptions: PreviewOption[] = [];
    if (configurationChangeEvent === undefined || configurationChangeEvent.affectsConfiguration(`vscode-metafont.previews.geometry.${this.configurationSection}.defaultVisibility.box`)) {
      const boxDefault: boolean | undefined = vscode.workspace.getConfiguration(`vscode-metafont.previews.geometry.${this.configurationSection}.defaultVisibility`).get('box');
      if (boxDefault !== undefined) {
        previewOptions.push({
          option: 'preview-option-box-lines',
          checked: boxDefault
        });
      }
    }
    if (configurationChangeEvent === undefined || configurationChangeEvent.affectsConfiguration(`vscode-metafont.previews.geometry.${this.configurationSection}.defaultVisibility.labels`)) {
      const labelsDefault: boolean | undefined = vscode.workspace.getConfiguration(`vscode-metafont.previews.geometry.${this.configurationSection}.defaultVisibility`).get('labels');
      if (labelsDefault !== undefined) {
        previewOptions.push({
          option: 'preview-option-labels',
          checked: labelsDefault
        });
      }
    }
    if (configurationChangeEvent === undefined || configurationChangeEvent.affectsConfiguration(`vscode-metafont.previews.geometry.${this.configurationSection}.defaultVisibility.paths`)) {
      const pathsDefault: string | undefined = vscode.workspace.getConfiguration(`vscode-metafont.previews.geometry.${this.configurationSection}.defaultVisibility`).get('paths');
      if (pathsDefault !== undefined) {
        switch (pathsDefault) {
        case 'paths with control points':
          previewOptions.push(
            { option: 'preview-option-paths', checked: true }
          );
          break;
        case 'paths without control points':
          previewOptions.push(
            { option: 'preview-option-paths', checked: true },
            { option: 'preview-option-control-points', checked: false }
          );
          break;
        case 'paths without points':
          previewOptions.push(
            { option: 'preview-option-paths', checked: true },
            { option: 'preview-option-control-points', checked: false },
            { option: 'preview-option-on-curve-points', checked: false }
          );
          break;
        case 'invisible':
          previewOptions.push(
            { option: 'preview-option-paths', checked: false }
          );
        }
      }
    }
    if (configurationChangeEvent === undefined || configurationChangeEvent.affectsConfiguration(`vscode-metafont.previews.geometry.${this.configurationSection}.defaultVisibility.picture`)) {
      const pathsDefault: string | undefined = vscode.workspace.getConfiguration(`vscode-metafont.previews.geometry.${this.configurationSection}.defaultVisibility`).get('picture');
      if (pathsDefault !== undefined) {
        switch (pathsDefault) {
        case 'picture with weights':
          previewOptions.push(
            { option: 'preview-option-pictures', checked: true },
            { option: 'preview-option-pixel-values', checked: true },
            { option: 'preview-option-crisp-edges', checked: false }
          );
          break;
        case 'picture without weights':
          previewOptions.push(
            { option: 'preview-option-pictures', checked: true },
            { option: 'preview-option-pixel-values', checked: false },
            { option: 'preview-option-crisp-edges', checked: true }
          );
          break;
        case 'invisible':
          previewOptions.push(
            { option: 'preview-option-pictures', checked: false },
            { option: 'preview-option-pixel-values', checked: true },
            { option: 'preview-option-crisp-edges', checked: false }
          );
        }
      }
    }
    if (previewOptions.length > 0) {
      this.setPreviewOption(previewOptions);
    }
  }

  setPreviewOption(previewOptions: PreviewOption[]) {
    this.postMessage({
      command: 'set-preview-option',
      data: previewOptions
    });
  }

  sendRefresh(titleBarItems: {[key: string]: any}[] = [], previewData: {[key: string]: any} | {[key: string]: any}[]) {
    this.postRefresh({
      titleBarItems: titleBarItems,
      previewData: previewData
    });
  }
}

export function mfPath2PreviewPathData(mfPath: types.MfPathData): types.PreviewBezier['data'] {
  let previewPath: types.PreviewBezier['data'] = {
    moveto: mfPath.moveTo,
    curvetos: mfPath.bezierCurveTos,
    cycle: !!mfPath.cycle
  };
  if (mfPath.cycle) {
    // back to start (moveto) to close path
    previewPath.curvetos.push({
      cp1: mfPath.cycle.cp1,
      cp2: mfPath.cycle.cp2,
      end: mfPath.moveTo
    });
  }
  return previewPath;
}

type PixelRow = [row: number, startCol: number, endCol: number, numRows: number];
export function mfPicture2PreviewPicture(mfPicture: types.MfPicture): types.PreviewPicture {
  let previewPictureData: types.PreviewPicture['data'] = {};
  for (const rowNumStr in mfPicture.edges) {

    let pos: PixelRow[] = [];
    let neg: PixelRow[] = [];
    let curWeight = 0;
    let starts: number[] = [];
    const edgeColumns = Object.keys(mfPicture.edges[rowNumStr]).map((x) => parseInt(x, 10)).sort((a, b) => a - b); // sort function required
    for (const colNum of edgeColumns) {
      let edgeWeight = mfPicture.edges[rowNumStr][colNum];
      if (edgeWeight === 0) {
        continue;
      }
      if (edgeWeight > 0) {
        while (curWeight < 0 && edgeWeight > 0) {
          const start = starts.pop();
          if (start !== undefined) {
            neg.push([parseInt(rowNumStr, 10), start, colNum, 1]);
            edgeWeight--;
            curWeight++;
          } else {
            break;
          }
        }
        if (edgeWeight > 0) {
          // remaining
          starts.push(...Array(edgeWeight).fill(colNum));
          curWeight += edgeWeight;
        }
      } else {
        while (curWeight > 0 && edgeWeight < 0) {
          const start = starts.pop();
          if (start !== undefined) {
            pos.push([parseInt(rowNumStr, 10), start, colNum, 1]);
            edgeWeight++;
            curWeight--;
          } else {
            break;
          }
        }
        if (edgeWeight < 0) {
          // remaining
          starts.push(...Array(-edgeWeight).fill(colNum)); // edgeWeight is negative
          curWeight += edgeWeight;
        }
      }
    }
    previewPictureData[rowNumStr] = {
      pos: pos,
      neg: neg
    };
  }
  combinePixelRows(previewPictureData, 'pos');
  combinePixelRows(previewPictureData, 'neg');
  const previewPicture: types.PreviewPicture = {
    line: mfPicture.line,
    filePath: mfPicture.filePath,
    type: 'Picture',
    data: previewPictureData,
    xoffset: 0,
    yoffset: 0,
    xGlyphPos: 0,
    yGlyphPos: 0
  };
  return previewPicture;
}

export type BoxLine = {
  type: 'BoxLine';
  data: [[number, number], [number, number]];
  xGlyphPos: number;
  yGlyphPos: number;
};
function combinePixelRows(picData: {[key: string]: {pos: BoxLine[]; neg: BoxLine[]}}, key: 'pos' | 'neg') {
  const rowNums = Object.keys(picData).map((k) => parseInt(k, 10)).sort((a, b) => a - b);
  for (const rowNum of rowNums) { // loop over rows
    const rowData = picData[rowNum][key];
    for (const boxRow of rowData) { // loop over boxes in current row
      for (let i = rowNum+1; i < rowNums.at(-1)!; i++) { // loop over the rows following current row
        if (picData[i] === undefined || picData[i][key].length === 0) {
          break;
        }
        let found = false;
        for (let j = 0; j < picData[i][key].length; j++) { // loop over all boxes in the next row
          const belowBoxLine = picData[i][key][j];
          if (boxRow[1] === belowBoxLine[1] && boxRow[2] === belowBoxLine[2]) {
            boxRow[3] += 1;
            picData[i][key].splice(j, 1);
            found = true;
            break; // only one box per line
          }
        }
        if (!found) {
          break; // one row without adjacent boxes, boxLine cannot be further combined with rows
        }
      }
    }
  }
}

export function getBoxLines(shipout: types.PreviewShipout, extensionFactor = 8, xGlyphPos = 0, yGlyphPos = 0) {
  const totalHeight = shipout.data.chardp + shipout.data.charht;
  const totalWidth = shipout.data.charwd + shipout.data.charic;
  const lineExtensionLength = Math.max(totalHeight, totalWidth) * extensionFactor;
  const contentGeneralItems: BoxLine[] = [];
  contentGeneralItems.push({type: 'BoxLine', data: [ // left
    [0, -shipout.data.chardp-lineExtensionLength],
    [0, shipout.data.charht+lineExtensionLength]
  ], xGlyphPos: xGlyphPos, yGlyphPos: yGlyphPos});
  if (shipout.data.charwd > 0) {
    contentGeneralItems.push({type: 'BoxLine', data: [ // right
      [shipout.data.charwd, -shipout.data.chardp-lineExtensionLength],
      [shipout.data.charwd, shipout.data.charht+lineExtensionLength]
    ], xGlyphPos: xGlyphPos, yGlyphPos: yGlyphPos});
  }
  if (shipout.data.charic > 0) {
    contentGeneralItems.push({type: 'BoxLine', data: [ // ic
      [totalWidth, -shipout.data.chardp-lineExtensionLength],
      [totalWidth, shipout.data.charht+lineExtensionLength]
    ], xGlyphPos: xGlyphPos, yGlyphPos: yGlyphPos});
  }
  if (shipout.data.charht !== 0) {
    contentGeneralItems.push({type: 'BoxLine', data: [ // top
      [-lineExtensionLength, shipout.data.charht],
      [totalWidth+lineExtensionLength, shipout.data.charht]
    ], xGlyphPos: xGlyphPos, yGlyphPos: yGlyphPos});
  }
  contentGeneralItems.push({type: 'BoxLine', data: [ // base
    [-lineExtensionLength, 0],
    [totalWidth+lineExtensionLength, 0]
  ], xGlyphPos: xGlyphPos, yGlyphPos: yGlyphPos});
  if (shipout.data.chardp !== 0) {
    contentGeneralItems.push({type: 'BoxLine', data: [ // bottom
      [-lineExtensionLength, -shipout.data.chardp],
      [totalWidth+lineExtensionLength, -shipout.data.chardp]
    ], xGlyphPos: xGlyphPos, yGlyphPos: yGlyphPos});
  }
  return contentGeneralItems;
}
