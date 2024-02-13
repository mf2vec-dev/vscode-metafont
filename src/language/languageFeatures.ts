import * as vscode from 'vscode';
import {
  DocumentSelector,
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient/node';
import { symbolicOrNumericTokenPattern } from './regexes';
import { OpenTextDocumentRequestArgs, OpenTextDocumentResponse } from './server';
import path = require('path');


let languageClient: LanguageClient;
const documentSelector: DocumentSelector & vscode.DocumentSelector = [
  {
    scheme: 'file',
    language: 'metafont'
  }
];

export function activateLanguageFeatures(ctx: vscode.ExtensionContext) {
  specifyLanguageConfiguration();

  ctx.subscriptions.push(
    vscode.commands.registerCommand('vscode-metafont.select-base', async () => {
      const a = await vscode.window.showQuickPick([
        'none',
        'plain',
        '$(add) Enter base file (.mf) path...'
      ]);
      if (a !== undefined) {
        vscode.window.showInformationMessage(a);
      }
      vscode.window.showWarningMessage('This command is not working yet.');
    })
  );

  return startClient(ctx);
}

function startClient(ctx: vscode.ExtensionContext) {

  const serverModule = ctx.asAbsolutePath(
    path.join('out', 'language', 'server.js')
  );

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.ipc
    },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: documentSelector
  };
  languageClient = new LanguageClient(
    'metafontLanguageServer',
    'METAFONT Language Server',
    serverOptions,
    clientOptions
  );

  languageClient.onRequest('OpenTextDocumentRequest', async (args: OpenTextDocumentRequestArgs): Promise<OpenTextDocumentResponse> => {
    // This is probably not the best way to make the server aware of a TextDocument...
    // Note: openTextDocument doesn't open the document in the GUI.
    await vscode.workspace.openTextDocument(vscode.Uri.parse(args.uri).path);
  });

  languageClient.onNotification('MetafontDocumentManagerStarted', async () => {
    // Open all mf files to make server aware of them. (probably not the best way to do this)
    const uris = await vscode.workspace.findFiles('**/*.mf');
    for (const uri of uris) {
      await vscode.workspace.openTextDocument(uri.path);
    }
  });

  languageClient.start();

  return languageClient;
}

function specifyLanguageConfiguration() {
  // Simple language configuration is specified in ../../language-configuration.json.
  // Complex language configuration (e.g. with regex, loops) is done here (if possible) for better documentation.

  // There are two ways to specify what a word is:
  // - editor.wordSeparators
  //   - double click on word
  //   - cursorWord* commands (e.g. Ctrl + RightArrow)
  // - vscode.LanguageConfiguration.wordPattern
  //   - pattern to find word for first call of editor.action.addSelectionToNextFindMatch (cursor position to word selection)
  //   - word highlighting

  // "editor.wordSeparators" in contributes.configurationDefaults:
  // This is just a list of characters.
  // vscode's default: "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/?"
  // default set for metafont: "%*()-=+[{]}\\|;:\",.<>/"
  // Only includes operators, brackets, loners, double quotes and period.
  // The following characters were removed from vscode's default since they appear as part of variable names: `~!@#$^&'?

  // vscode.LanguageConfiguration.wordPattern is defined below.

  const languageConfiguration: vscode.LanguageConfiguration = {
    wordPattern: symbolicOrNumericTokenPattern,
    indentationRules: {
      increaseIndentPattern: /^(?:(?!%).)*(?:\(|\[|\{|(?<=^|[^A-Za-z_])(?:(?:var|primary|secondary|tertiary)?def|if|else(?:if)?|for(?:suffixes|ever)?)(?=$|[^A-Za-z_])).*$/,
      decreaseIndentPattern: /(?:(?!%).)*(?:\)|\]|\}|(?<=^|[^A-Za-z_])(?:enddef|else(?:if)?|fi|endfor)(?=$|[^A-Za-z_])).*$/
    }
  };
  vscode.languages.setLanguageConfiguration('metafont', languageConfiguration);

  const foldingRangeProvider: vscode.FoldingRangeProvider = {
    provideFoldingRanges(document: vscode.TextDocument, _context: vscode.FoldingContext, _token: vscode.CancellationToken) {
      let foldingRanges: vscode.FoldingRange[] = [];
      const startRegex = /\(|\[|\{|(?:(?<=^|[^A-Za-z_])(?:var|primary|secondary|tertiary)?def|(?<=^|[^A-Za-z_])if|(?<=(?<=^|[^A-Za-z_])e)lse(?:if)?|(?<=^|[^A-Za-z_])for(?:suffixes|ever))(?=$|[^A-Za-z_])/g;
      const endRegex = /\)|\]|\}|(?<=^|[^A-Za-z_])(?:enddef(?=$|[^A-Za-z_])|e(?=lse(?:if)?(?=$|[^A-Za-z_]))|fi(?=$|[^A-Za-z_])|endfor(?=$|[^A-Za-z_]))/g;
      let startLines: number[] = [];
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        const commentStart = indexOfPercent(line);
        let startMatches = [...line.matchAll(startRegex)];
        startMatches = startMatches.filter((match) => match.index !== undefined && (commentStart === null || commentStart > match.index));
        let endMatches = [...line.matchAll(endRegex)];
        endMatches = endMatches.filter((match) => match.index !== undefined && (commentStart === null || commentStart > match.index));
        // todo support multiple matches in same line
        // todo check for matching, e.g. ( and ), def and enddef, etc.
        const startMatch = startMatches[0];
        const endMatch = endMatches[0];
        const endsOnSameLine = startMatch?.index !== undefined && endMatch?.index !== undefined && endMatch.index > startMatch.index;
        if (endMatch && !endsOnSameLine) {
          const start = startLines.pop();
          if (start) {
            foldingRanges.push(new vscode.FoldingRange(start, i));
          }
        }
        if (startMatch && !endsOnSameLine) {
          startLines.push(i);
        }
      }
      return foldingRanges;
    }
  };
  vscode.languages.registerFoldingRangeProvider('metafont', foldingRangeProvider);
}

// helpers

function indexOfPercent(line: string): number | null {
  let insideString = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      insideString = !insideString;
    } else if (char === '%' && !insideString) {
      return i;
    }
  }
  return null;
}
