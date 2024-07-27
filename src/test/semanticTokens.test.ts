import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, getDocUri, openDocument } from './utils';


suite('Semantic Tokens', () => {
  test('let with if creates semantic tokens', async () => {
    const docUri = getDocUri('semanticTokens_let_if.test.mf');
    await testSemanticTokens(docUri, new Uint32Array([
      0, 4, 2, 3, 0,
      1, 0, 2, 3, 0
    ]));
  });
});

async function testSemanticTokens(docUri: vscode.Uri, expectedSemanticTokenData: vscode.SemanticTokens['data']) {
  await activateExtension();
  await openDocument(docUri);

  const actualSemanticTokens = (await vscode.commands.executeCommand(
    'vscode.provideDocumentSemanticTokens',
    docUri
  ) as vscode.SemanticTokens);

  assert.deepEqual(actualSemanticTokens.data, expectedSemanticTokenData);
}
