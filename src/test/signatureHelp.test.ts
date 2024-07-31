import * as assert from 'assert';
import * as vscode from 'vscode';
import { activateExtension, getDocUri, openDocument } from './utils';


suite('Signature Help', () => {
  test('signature help provided for def macro 1', async () => {
    const docUri = getDocUri('signatureHelp_def_1.test.mf');
    await testSignatureHelp(docUri, [
      {
        position: new vscode.Position(3, 1),
        helpItems: [
          {
            'label': 'def a(expr x,y,z)(suffix s)text t',
            parameters: []
          }
        ]
      },
      {
        position: new vscode.Position(3, 2),
        helpItems: [
          {
            'activeParameter': 0,
            'label': 'def a(expr x,y,z)(suffix s)text t',
            parameters: [
              { 'label': [ 11, 12 ] },
              { 'label': [ 13, 14 ] },
              { 'label': [ 15, 16 ] },
              { 'label': [ 25, 26 ] },
              { 'label': [ 32, 33 ] }
            ]
          }
        ]
      }
    ]);
  });
  test('signature help provided for def macro 2', async () => {
    const docUri = getDocUri('signatureHelp_def_2.test.mf');
    await testSignatureHelp(docUri, [
      {
        position: new vscode.Position(4, 1),
        helpItems: [
          {
            'label': 'def a(expr x)(suffix s)(text t)expr e of o',
            parameters: []
          }
        ]
      },
      {
        position: new vscode.Position(4, 2),
        helpItems: [
          {
            'activeParameter': 0,
            'label': 'def a(expr x)(suffix s)(text t)expr e of o',
            parameters: [
              { 'label': [ 11, 12 ] },
              { 'label': [ 21, 22 ] },
              { 'label': [ 29, 30 ] },
              { 'label': [ 36, 37 ] },
              { 'label': [ 41, 42 ] }
            ]
          }
        ]
      }
    ]);
  });
});

async function testSignatureHelp(docUri: vscode.Uri, helpData: {position: vscode.Position; helpItems: vscode.SignatureInformation[]}[]) {
  await activateExtension();
  await openDocument(docUri);

  for (const help of helpData) {
    const actualSignatureHelp = (await vscode.commands.executeCommand(
      'vscode.executeSignatureHelpProvider',
      docUri, help.position
    ) as vscode.SignatureHelp);

    const expectedSignatureHelpItems = help.helpItems.map((item) => {
      item.parameters = item.parameters.map((param) => {
        return {
          documentation: undefined,
          ...param
        };
      });
      return {
        activeParameter: undefined,
        documentation: undefined,
        ...item
      };
    });

    assert.deepEqual(actualSignatureHelp.signatures, expectedSignatureHelpItems);
  }
}
