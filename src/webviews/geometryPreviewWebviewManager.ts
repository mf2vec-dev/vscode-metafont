import * as vscode from 'vscode';

import * as types from '../base/types';
import { ContentTypeSpecificWebviewManager, WebviewManager } from './webviewManager';

export abstract class GeometryPreviewWebviewManager extends WebviewManager implements ContentTypeSpecificWebviewManager {
  rawPreviewItems: types.PreviewItem[] | Map<number, types.PreviewItem[]> | undefined = undefined;
  multiGeometry = false;
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

type BoxLine = {
  type: 'BoxLine';
  data: [[number, number], [number, number]];
  xGlyphPos: number;
  yGlyphPos: number;
};
function combinePixelRows(picData: {[key: string]: {pos: BoxLine[], neg: BoxLine[]}}, key: 'pos' | 'neg') {
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
