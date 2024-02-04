import * as path from 'path';
import * as vscode from 'vscode';

export async function activateExtension() {
  try {
    const ext = vscode.extensions.getExtension('mf2vec-dev.vscode-metafont')!;
    await ext.activate();
    await sleep(2000); // Wait for server activation
  } catch (e) {
    console.error(e);
  }
}

export async function openDocument(docUri: vscode.Uri) {
  try {
    const doc = await vscode.workspace.openTextDocument(docUri);
    await vscode.window.showTextDocument(doc);
  } catch (e) {
    console.error(e);
  }
}

export async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const getDocPath = (docName: string) => {
  return path.resolve(__dirname, 'fixtures', docName);
};

export const getDocUri = (docName: string) => {
  return vscode.Uri.file(getDocPath(docName));
};

export function toRange(startLine: number, startChar: number, endLine: number, endChar: number) {
  const start = new vscode.Position(startLine, startChar);
  const end = new vscode.Position(endLine, endChar);
  return new vscode.Range(start, end);
}
