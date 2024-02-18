import * as vscode from 'vscode';

export type BezierCurveTo = {
  cp1: [number, number];
  cp2: [number, number];
  end: [number, number];
};
export type MfPathData = {
  type: 'path';
  line: number; // one-based
  filePath: string; // absolute path
  moveTo: [number, number];
  bezierCurveTos: BezierCurveTo[];
  cycle: {
    cp1: [number, number];
    cp2: [number, number];
  } | undefined;
};
export type MfPicture = {
  type: 'picture';
  line: number; // one-based
  filePath: string; // absolute path
  edges: {[row: string]: {[col: string]: number}};
};
export type MfLabel = {
  type: 'label';
  line: number; // one-based
  filePath: string; // absolute path
  dot: boolean;
  x: number;
  y: number;
  pos: string;
  text: string;
};
export type MfShipout = {
  type: 'shipout';
  line: number; // one-based
  filePath: string; // absolute path
  charcode: number;
  charext: number;
  charwd: number;
  charht: number;
  chardp: number;
  charic: number;
  xoffset: number;
  yoffset: number;
  picture?: MfPicture;
};
export type MfLigtable = {
  type: 'ligtable';
  line: number; // one-based
  filePath: string; // absolute path
  kerns: [number, number, number, number][]; // char1, char2, kern, kern*hppp // todo not very efficient
  ligs: [number, number, string, number][];
};

export type MfCommand = MfPathData | MfLabel | MfShipout | MfLigtable;

export function isMfPath(cmd: MfCommand): cmd is MfPathData {
  return cmd.type === 'path';
}
export function isMfLabel(cmd: MfCommand): cmd is MfLabel {
  return cmd.type === 'label';
}
export function isMfShipout(cmd: MfCommand): cmd is MfShipout {
  return cmd.type === 'shipout';
}
export function isMfLigtable(cmd: MfCommand): cmd is MfLigtable {
  return cmd.type === 'ligtable';
}

// types to store info to pass to preview

export type PreviewBezier = {
  line: number; // one-based
  filePath: string; // absolute path
  type: 'Bezier';
  data: {
    moveto: [number, number];
    curvetos: { cp1: [number, number]; cp2: [number, number]; end: [number, number] }[];
    cycle: boolean;
  };
  xoffset: number;
  yoffset: number;
  xGlyphPos: number;
  yGlyphPos: number;
};
export type PreviewPicture = {
  line: number; // one-based
  filePath: string; // absolute path
  type: 'Picture';
  data: {};
  xoffset: number;
  yoffset: number;
  xGlyphPos: number;
  yGlyphPos: number;
};
export type PreviewLabel = {
  line: number; // one-based
  filePath: string; // absolute path
  type: 'Label';
  data: {
    mid: [number, number];
    text: string;
    pos: string;
  };
  xoffset: number;
  yoffset: number;
  xGlyphPos: number;
  yGlyphPos: number;
};
export type PreviewShipout = {
  line: number; // one-based
  filePath: string; // absolute path
  type: 'shipout';
  data: {
    charcode: number;
    charext: number;
    charwd: number;
    charht: number;
    chardp: number;
    charic: number;
    xoffset: number;
    yoffset: number;
    picture?: PreviewPicture;
  };
};

export type PreviewGeomItem = PreviewBezier | PreviewPicture | PreviewLabel;
export type PreviewItem = PreviewGeomItem | PreviewShipout;



export function isPreviewShipout(cmd: PreviewItem): cmd is PreviewShipout {
  return cmd.type === 'shipout';
}

export type Trace = {
  type: string;
  trace: string;
};

export type TokenProcessingResult = {
  /** output of METAFONT using the debugger */
  rawResponse: string;
  /** reconstructed output of METAFONT without debugger */
  cleanResponse: string;
  input?: MetafontInputStatement; // todo as array ?
  exception?: boolean;
};
export type MetafontInputStatement = {
  inputPath: string;
};


// project files

export type MfFileOrCategory = MfFileCategory | MfFile | MfFileInput;
export type MfFileCategory = { label: string; id: MfFileCategoryId };
export enum MfFileCategoryId { // enum for clarity in .mf-project file
  unknown = 'unknown',
  param = 'param',
  driver = 'driver',
  program = 'program',
  base = 'base'
};
export type MfFile = { uri: vscode.Uri; categoryIds: MfFileCategoryId[] };
export type MfFileInput = {
  uri: vscode.Uri;
  parentUri: vscode.Uri;
  /** true: this file is inputted somewhere else */
  inputtedBy: boolean;
};
export function isMfFileCategory(fileOrCategory: MfFileOrCategory): fileOrCategory is MfFileCategory {
  return 'id' in fileOrCategory;
}
export function isMfFile(fileOrCategory: MfFileOrCategory): fileOrCategory is MfFile {
  return 'categoryIds' in fileOrCategory;
}
export function isMfFileInput(fileOrCategory: MfFileOrCategory): fileOrCategory is MfFileInput {
  return 'inputtedBy' in fileOrCategory;
}

//

export type ExpressionResult = {
  kind: 'error' | 'raw' | 'value';
  type?: string;
  content: string;
};
