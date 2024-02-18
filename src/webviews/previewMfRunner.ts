import * as childProcess from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, rm } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as types from '../base/types';

export function runMfForPreview(absFilePath: string, firstLine = '', logPaths = true, createPictures = true, logLigtables = false) {
  // TODO make a temp dir only once, not every time
  const workspacePath = vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath; // todo option to select other than 0 for multiple workspaces
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'vscode-metafont-preview-'));
  let mf2vecFirstLine = '\\';
  if (logPaths && createPictures) {
    // add logging of paths to contour and doublepath
    // todo: picture is unknown for paths
    mf2vecFirstLine += (
      'let __mfIIvec__contour__=contour;'
      + 'let __mfIIvec__doublepath__=doublepath;'
      + 'def contour expr e=hide(message"@mf2vec@contour";show e;message"@mf2vec@";)__mfIIvec__contour__ e enddef;'
      + 'def doublepath expr e=hide(message"@mf2vec@doublepath";show e;message"@mf2vec@";)__mfIIvec__doublepath__ e enddef;'
    );
  } else if (logPaths && !createPictures) {
    // deactivate addto command, only log paths
    // todo: picture is unknown
    mf2vecFirstLine += (
      'def addto expr e=enddef;'
      + 'def also expr e=enddef;'
      + 'def contour expr e=hide(message"@mf2vec@contour";show e;message"@mf2vec@";)enddef;'
      + 'def doublepath expr e=hide(message"@mf2vec@doublepath";show e;message"@mf2vec@";)enddef;'
      + 'def withweight expr e=enddef;'
      + 'def withpen expr e=enddef;'
    );
  } else if (!logPaths && !createPictures) {
    mf2vecFirstLine += (
      'def addto expr e=enddef;'
      + 'def also expr e=enddef;'
      + 'def contour expr e=enddef;'
      + 'def doublepath expr e=enddef;'
      + 'def withweight expr e=enddef;'
      + 'def withpen expr e=enddef;'
    );
  } // else !logPaths && createPictures which is default mf
  if (logLigtables) {
    mf2vecFirstLine += (
      'let __mfIIvec__orig_hide__=hide;'
      + 'def __mfIIvec__redef_colon__='
        + 'def __mfIIvec__special_colon__='
          + '__mfIIvec__orig_hide__(let: =__mfIIvec__showing_colon__;)'
          + '__mfIIvec__orig_colon__ '
          + 'enddef;'
        + 'save if,elseif,else,for,forsuffixes,forever;'
        + 'def if='
          + '__mfIIvec__orig_if__ '
          + '__mfIIvec__orig_hide__(let: =__mfIIvec__special_colon__;)'
        + 'enddef;'
        + 'def elseif='
          + '__mfIIvec__orig_elseif__ '
          + '__mfIIvec__orig_hide__(let: =__mfIIvec__special_colon__;)'
        + 'enddef;'
        + 'def else='
          + '__mfIIvec__orig_else__ '
          + '__mfIIvec__orig_hide__(let: =__mfIIvec__special_colon__;)'
        + 'enddef;'
        + 'def for='
          + '__mfIIvec__orig_for__ '
          + '__mfIIvec__orig_hide__(let: =__mfIIvec__special_colon__;)'
        + 'enddef;'
        + 'def forsuffixes='
          + '__mfIIvec__orig_forsuffixes__ '
          + '__mfIIvec__orig_hide__(let: =__mfIIvec__special_colon__;)'
        + 'enddef;'
        + 'def forever='
          + '__mfIIvec__orig_forever__ '
          + '__mfIIvec__orig_hide__(let: =__mfIIvec__special_colon__;)'
        + 'enddef;'
        + 'let: =__mfIIvec__showing_colon__;'
      + 'enddef;'
      + 'def ligtable text t=message"@mf2vec@ligtable";show hppp;begingroup '
        + 'save:,::,||:,kern,=:,|=:,|=:>,=:|,=:|>,|=:|,|=:|>,|=:|>>,skipto;'
        + 'def __mfIIvec__showing_colon__=;message"@mf2vec@";message"@mf2vec@:";show enddef;'
        + 'def'+  ':: '  +'=;'+'message"@mf2vec@";message"@mf2vec@::";'    +'show enddef;'
        + 'def'+'||: '   +'=' +'message"@mf2vec@";message"@mf2vec@pp:";'   +'show enddef;'
        + 'def kern'     +'=;'+'message"@mf2vec@";message"@mf2vec@kern";'  +'show enddef;'
        + 'def'+ '=: '   +'=;'+'message"@mf2vec@";message"@mf2vec@=:";'    +'show enddef;'
        + 'def'+'|=: '   +'=;'+'message"@mf2vec@";message"@mf2vec@p=:";'   +'show enddef;'
        + 'def'+'|=:> '  +'=;'+'message"@mf2vec@";message"@mf2vec@p=:g";'  +'show enddef;'
        + 'def'+ '=:| '  +'=;'+'message"@mf2vec@";message"@mf2vec@=:p";'   +'show enddef;'
        + 'def'+ '=:|> ' +'=;'+'message"@mf2vec@";message"@mf2vec@=:pg";'  +'show enddef;'
        + 'def'+'|=:| '  +'=;'+'message"@mf2vec@";message"@mf2vec@p=:p";'  +'show enddef;'
        + 'def'+'|=:|> ' +'=;'+'message"@mf2vec@";message"@mf2vec@p=:pg";' +'show enddef;'
        + 'def'+'|=:|>> '+'=;'+'message"@mf2vec@";message"@mf2vec@p=:pgg";'+'show enddef;'
        + 'def skipto=__mfIIvec__orig_hide__(message"@mf2vec@";message"@mf2vec@skipto")enddef;'
        + '__mfIIvec__redef_colon__ '
        + 'show t;endgroup;message"@mf2vec@"'
      + 'enddef;'
    );
  } else {
    mf2vecFirstLine += (
      'def ligtable text t=enddef;'
    );
  }
  mf2vecFirstLine += (
    'def special expr e=message"@mf2vec@special";show (0,0)..cycle;show e;message"@mf2vec@";enddef;'
    + 'def numspecial expr e=message"@mf2vec@numspecial";show e;message"@mf2vec@";enddef;'
    + 'def shipout expr e=message"@mf2vec@shipout";show (0,0)..cycle;show hppp,charcode,charext,charwd,charht,chardp,charic,xoffset,yoffset,e;message"@mf2vec@";enddef;'
    + 'let __mfIIvec__input__=input;'
    + 'def input='
      + 'message"@mf2vec@input";'
      + 'scantokens("message"&char34&"@mf2vec@"&char34&";")'
      + '__mfIIvec__input__ '
    + 'enddef;'
    // not needed for preview:
    + 'def charlist text t=enddef;'
    + 'def extensible text t=enddef;'
    + 'def headerbyte text t=enddef;'
    + 'def display text t=enddef;'
    + 'def openwindow text t=enddef;'
    + 'displaying:=0;'
    + firstLine
    + 'input ' + absFilePath + ';'
  );
  const mfArgs = [
    '-interaction=batchmode',
    '-output-directory=' + tmpDir,
    mf2vecFirstLine
  ];
  childProcess.spawnSync( // sync since log file is needed
    'mf',
    mfArgs,
    { cwd: workspacePath }
  );

  const logFileName = readdirSync(tmpDir).filter((fn) => fn.endsWith('.log'))[0];
  const logContent = readFileSync(path.join(tmpDir, logFileName), 'utf-8');

  const logMatches = [...logContent.matchAll(/@mf2vec@(input|contour|doublepath|special|numspecial|shipout|ligtable|::?|kern|p?=:p?(?:gg?)?|skipto)\s(.*?)\n@mf2vec@/gms)];
  let commands: types.MfCommand[] = [];
  let curAbsFilePath = absFilePath;
  let skiptos: {[key: number]: number[]} = {};
  for (let i = 0; i < logMatches.length; i++) {
    const logMatch = logMatches[i];
    const cmdName = logMatch[1];
    let cmdBody = logMatch[2];
    let cmdBodyItems = cmdBody.split(/\n>> /); // split show commands // todo keep or remove >> for every item
    const pathTraceMatch = cmdBodyItems[0].match(/>> Path at line (\d+):\n(.*?)\n$/s);
    let line: number;
    let pathStr: string | null;
    if (pathTraceMatch) {
      line = parseInt(pathTraceMatch[1], 10);
      pathStr = pathTraceMatch[2].replace(/\s/g,'');
    } else {
      line = 0;
      pathStr = null;
    }
    if (cmdName === 'input') {
      const filePathMatch = cmdBody.match(/^\((.*)\)?$/);
      if (filePathMatch) {
        curAbsFilePath = filePathMatch[1];
        if (workspacePath) {
          curAbsFilePath = path.resolve(workspacePath, curAbsFilePath);
        }
      }
    } else if (cmdName === 'contour' || cmdName === 'doublepath') {
      if (pathStr) {
        const mfPath = parsePathString(pathStr, line, curAbsFilePath);
        if (mfPath) {
          commands.push(mfPath);
        }
      }
    } else if (cmdName === 'special') {
      // TODO rule ?
      let cmdInfo = cmdBodyItems[1];
      cmdInfo = cmdInfo.slice(1, cmdInfo.length-1); // slice "s off
      if (cmdInfo[0] === ' ' && ['0', '1', '2', '3', '4', '5', '6', '7', '8'].includes(cmdInfo[1])) {
        let posInt = parseInt(cmdInfo[1]);
        let dot;
        if (posInt > 4) {
          posInt -= 4;
          dot = false;
        } else {
          dot = true;
        }
        let pos;
        switch (posInt) {
        case 0:
        default:
          pos = 'auto';
          break;
        case 1:
          pos = 'top';
          break;
        case 2:
          pos = 'lft';
          break;
        case 3:
          pos = 'rt';
          break;
        case 4:
          pos = 'bot';
          break;
        }
        if (logMatches[i+1][1] === 'numspecial' && logMatches[i+2][1] === 'numspecial') {
          const x = parseFloat(logMatches[i+1][2].slice(3)); // slice '>> ' off
          const y = parseFloat(logMatches[i+2][2].slice(3)); // slice '>> ' off
          let label: types.MfLabel = {
            type: 'label',
            line: line,
            filePath: curAbsFilePath,
            dot: dot,
            x: x,
            y: y,
            pos: pos,
            text: cmdInfo.slice(2) // slice space and position number off
          };
          commands.push(label);
          i += 2;
        }
      }
    } else if (cmdName === 'shipout') {
      cmdBodyItems = cmdBodyItems.slice(1); // slice first item (path with line number) off
      const hppp = parseFloat(cmdBodyItems[0]);
      const shipout: types.MfShipout = {
        type: 'shipout',
        line: line,
        filePath: curAbsFilePath,
        charcode: parseFloat(cmdBodyItems[1]),
        charext: parseFloat(cmdBodyItems[2]),
        charwd: hppp*parseFloat(cmdBodyItems[3]),
        charht: hppp*parseFloat(cmdBodyItems[4]),
        chardp: hppp*parseFloat(cmdBodyItems[5]),
        charic: hppp*parseFloat(cmdBodyItems[6]),
        xoffset: parseFloat(cmdBodyItems[7]),
        yoffset: parseFloat(cmdBodyItems[8]),
        picture: parsePictureString(cmdBodyItems[9], line, curAbsFilePath)
      };
      commands.push(shipout);
    } else if (cmdName === 'ligtable') {
      const kerns: types.MfLigtable['kerns'] = [];
      const ligs: types.MfLigtable['ligs'] = [];
      const tmpList: number[] = [];
      let lastCmdBody: string;
      cmdBodyItems[0] = cmdBodyItems[0].slice(3);
      const hppp = parseInt(cmdBodyItems[0], 10);
      cmdBodyItems = cmdBodyItems.slice(1);
      for (i++; i < logMatches.length; i++) {
        const logMatch = logMatches[i];
        const cmdName = logMatch[1];
        lastCmdBody = cmdBodyItems.at(-1)!;
        cmdBodyItems = logMatch[2].slice(3).split(/\n>> /);
        cmdBody = cmdBodyItems[0];
        if (cmdName === ':') {
          tmpList.push(toCharCode(lastCmdBody));
        } else if (cmdName === 'kern') {
          const kern = parseFloat(cmdBody);
          const char2 = toCharCode(lastCmdBody);
          kerns.push(
            ...tmpList.map((char1) => {
              const k: [number, number, number, number] = [char1, char2, kern, kern*hppp];
              return k;
            })
          );
        } else if (['=:', 'p=:' , 'p=:g', '=:p', '=:pg', 'p=:p', 'p=:pg', 'p=:pgg'].includes(cmdName)) {
          const ligType = cmdName.replace('p', '|').replace('g', '>');
          const ligChar = toCharCode(cmdBody);
          const char2 = toCharCode(lastCmdBody);
          ligs.push(
            ...tmpList.map((char1) => {
              const l: [number, number, string, number] = [char1, char2, ligType, ligChar];
              return l;
            })
          );
        } else if (cmdName === 'skipto') {
          skiptos[cmdBody] = tmpList;
        } else if (cmdName === '::') {
          if (skiptos[lastCmdBody] !== undefined) {
            tmpList.push(...skiptos[lastCmdBody]);
          }
        } else {
          i--; // outer loop will increase again
          break;
        }
      }
      const ligtable: types.MfLigtable = {
        type: 'ligtable',
        line: line,
        filePath: curAbsFilePath,
        kerns: kerns,
        ligs: ligs
      };
      commands.push(ligtable);
    }
  }

  // remove tmpDir with log file
  rm(tmpDir, { recursive: true }, () => {});

  return commands;
}

export function parsePathString(pathStr: string, line: number, curFilePath: string): types.MfPathData | undefined {
  pathStr = pathStr.replace(/\s/g,'');
  const pathMatch = pathStr.match(/\((-?[\d\.]+),(-?[\d\.]+)\)((?:\.\.controls\(.*?\)and\(.*?\)\.\.\(.*?\))+)(?:..controls\((-?[-\d\.]+),(-?[-\d\.]+)\)and\((-?[\d\.]+),(-?[\d\.]+)\)\.\.cycle)?/);
  if (pathMatch) {
    const moveTo: [number, number] = [parseFloat(pathMatch[1]), parseFloat(pathMatch[2])];
    const bezierCurveTosStr = pathMatch[3];
    let cycle;
    if (pathMatch[4] && pathMatch[5] && pathMatch[6] && pathMatch[7]) {
      cycle = {
        cp1: [parseFloat(pathMatch[4]), parseFloat(pathMatch[5])],
        cp2: [parseFloat(pathMatch[6]), parseFloat(pathMatch[7])]
      };
    } else {
      cycle = undefined;
    }
    let bezierCurveTos: types.BezierCurveTo[] = [];
    const cubicTosMatches = bezierCurveTosStr.matchAll(/\.\.controls\(([-\d\.]+),([-\d\.]+)\)and\(([-\d\.]+),([-\d\.]+)\)\.\.\(([-\d\.]+),([-\d\.]+)\)/g);
    for (const bezierCurveTosMatch of cubicTosMatches) {
      bezierCurveTos.push({
        cp1: [parseFloat(bezierCurveTosMatch[1]), parseFloat(bezierCurveTosMatch[2])],
        cp2: [parseFloat(bezierCurveTosMatch[3]), parseFloat(bezierCurveTosMatch[4])],
        end: [parseFloat(bezierCurveTosMatch[5]), parseFloat(bezierCurveTosMatch[6])]
      });
    }
    let mfPath: types.MfPathData = {
      type: 'path',
      line: line,
      filePath: curFilePath,
      moveTo: moveTo,
      bezierCurveTos: bezierCurveTos,
      cycle: cycle
    };
    return mfPath;
  }
}

export function parsePictureString(pictureStr: string, line: number, curFilePath: string): types.MfPicture | undefined {
  pictureStr = pictureStr.replaceAll('\n ', ' ');
  const rowStrings = pictureStr.split('\n');
  let picEdges = {};
  for (const rowStr of rowStrings) {
    const rowMatch = rowStr.match(/row (-?\d+): (.*)$/);
    if (rowMatch) {
      const rowNum = parseInt(rowMatch[1]);
      const rowEdgesStr = rowMatch[2];
      const rowEdgeMatches = rowEdgesStr.matchAll(/(-?\d+)(\++|-+)/g);
      let rowEdges = {};
      for (const edgeMatch of rowEdgeMatches) {
        const colNum = parseInt(edgeMatch[1]);
        const edgesStr = edgeMatch[2];
        const edges = edgesStr.length * (edgesStr[0] === '-' ? -1 : 1);
        if (rowEdges.hasOwnProperty(colNum)) {
          rowEdges[colNum] += edges;
        } else {
          rowEdges[colNum] = edges;
        }
      }
      picEdges[rowNum] = rowEdges;
    }
  }
  const mfPicture: types.MfPicture = {
    type: 'picture',
    line: line,
    filePath: curFilePath,
    edges: picEdges
  };
  return mfPicture;
}

function toCharCode(charOrCode: string) {
  if (charOrCode[0] === '"') {
    // charOrCode is char
    const char = charOrCode.slice(1, -1); // remove "s
    return char.charCodeAt(0);
  }
  return parseInt(charOrCode, 10);
}
