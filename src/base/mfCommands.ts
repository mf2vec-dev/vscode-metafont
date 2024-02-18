import * as childProcess from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { activeMfFileAbsPath } from '../extension';
import { MfFileManager } from './mfFileManager';
import { applyParams } from './utils';


let terminal: vscode.Terminal | undefined = undefined;
export function activateMfCommands(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('vscode-metafont.run-mf-active-file', () => runMfInTerminal(activeMfFileAbsPath, 'No active mf file'))
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand('vscode-metafont.run-mf-default-job', () => runMfInTerminal(mfFileManager.defaultJobPath, 'No default job selected'))
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand('vscode-metafont.generate-gftodvi-active-file', () => generateGftodviProofSheet(activeMfFileAbsPath, 'No active mf file'))
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand('vscode-metafont.generate-gftodvi-default-job', () => generateGftodviProofSheet(mfFileManager.defaultJobPath, 'No default job selected'))
  );
}

function runMfInTerminal(filePath: string | undefined, undefinedPathInfoMessage: string) {
  if (filePath === undefined) {
    vscode.window.showInformationMessage(undefinedPathInfoMessage);
    return;
  }
  if (terminal === undefined) {
    terminal = vscode.window.createTerminal('METAFONT Terminal');
  }
  terminal.show();
  terminal.sendText(`mf "${filePath}"`);
}

function generateGftodviProofSheet(filePath: string | undefined, undefinedPathInfoMessage: string) {
  if (filePath === undefined) {
    vscode.window.showInformationMessage(undefinedPathInfoMessage);
    return;
  }
  const cwd = vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath;
  const execOptions: childProcess.ExecSyncOptionsWithBufferEncoding = {
    cwd: cwd
  };
  const mfBuffer = childProcess.execSync(applyParams('${mf} -interaction=nonstopmode ${jobPath}', { mf: 'mf', jobPath: filePath }), execOptions);
  const lastLines = mfBuffer.toString().split('\n').slice(-4).join('\n');
  const outputLineMatch = lastLines.match(/^Output written on ((.*)\.\d+gf) \(.*\).$/m);
  if (outputLineMatch === null) {
    vscode.window.showInformationMessage('No output could be identified from the METAFONT run. Make sure mode is not batchmode.');
  } else {
    const gfFileName = outputLineMatch[1];
    const jobName = outputLineMatch[2];
    try {
      childProcess.execSync(applyParams('${gftodvi} ${gfFileName}', { gftodvi: 'gftodvi', gfFileName: gfFileName }), execOptions);
    } catch (e: any) {
      if (e.message !== undefined && e.message.includes('gftodvi: fatal: tfm file `gray.tfm\' not found.')) {
        // generate missing gray.tfm
        childProcess.execSync(applyParams('${mktextfm} gray', { mktextfm: 'mktextfm' }), execOptions);
        // try again
        childProcess.execSync(applyParams('${gftodvi} ${gfFileName}', { gftodvi: 'gftodvi', gfFileName: gfFileName }), execOptions);
      } else {
        throw e;
      }
    }
    childProcess.execSync(applyParams('${dvipdf} ${jobName}.dvi', { dvipdf: 'dvipdf', jobName: jobName }), execOptions);
    let pdfUri: vscode.Uri;
    if (cwd === undefined) {
      pdfUri = vscode.Uri.file(`${jobName}.pdf`);
    } else {
      pdfUri = vscode.Uri.file(path.resolve(cwd, `${jobName}.pdf`));
    }
    openPdfPreview(pdfUri);
  }
}

export function openPdfPreview(uri: vscode.Uri) {
  vscode.commands.executeCommand('vscode.openWith', uri, '', vscode.ViewColumn.Beside); // '' opens with installed pdf viewer, even if not default
}
