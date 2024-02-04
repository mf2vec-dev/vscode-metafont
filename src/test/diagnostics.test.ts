import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, getDocUri, openDocument, toRange } from './utils';


suite('Diagnostics', () => {
  test('unreachable token after end', async () => {
    const docUri = getDocUri('diagnostics_end.test.mf');
    await testDiagnostics(docUri, [
      { message: 'Unreachable token.', range: toRange(0, 4, 0, 5), severity: vscode.DiagnosticSeverity.Hint, tags: [ vscode.DiagnosticTag.Unnecessary ]}
    ]);
  });

  test('unreachable token below endinput', async () => {
    const docUri = getDocUri('diagnostics_endinput.test.mf');
    await testDiagnostics(docUri, [
      { message: 'Unreachable token.', range: toRange(1, 0, 1, 1), severity: vscode.DiagnosticSeverity.Hint, tags: [ vscode.DiagnosticTag.Unnecessary ]}
    ]);
  });
});

async function testDiagnostics(docUri: vscode.Uri, expectedDiagnostics: vscode.Diagnostic[]) {
  await activateExtension();
  await openDocument(docUri);
  vscode.window.showInformationMessage('doc open.');

  const actualDiagnostics = vscode.languages.getDiagnostics(docUri);

  assert.equal(actualDiagnostics.length, expectedDiagnostics.length);

  expectedDiagnostics.forEach((expectedDiagnostic, i) => {
    const actualDiagnostic = actualDiagnostics[i];
    assert.equal(actualDiagnostic.message, expectedDiagnostic.message);
    assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
    assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity);
    assert.deepEqual(actualDiagnostic.tags, expectedDiagnostic.tags);
  });
}