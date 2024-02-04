import {
  createConnection,
  DeclarationParams,
  DefinitionParams,
  Hover,
  HoverParams,
  InitializeParams,
  InitializeResult,
  LocationLink,
  MarkupContent,
  MarkupKind,
  Range,
  SemanticTokensBuilder,
  SemanticTokensParams
} from 'vscode-languageserver/node';

import { existsSync } from 'node:fs';
import { MetafontDocumentManager, TokenType } from './metafontDocumentManager';
import { numericTokenPattern } from './regexes';


const serverName = 'METAFONT Language Server';

const connection = createConnection();
let documentManager = new MetafontDocumentManager(connection, serverName);
const tokenTypeList = Object.values(TokenType);
connection.onInitialize((_initializeParams: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      declarationProvider: true,
      hoverProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: tokenTypeList,
          tokenModifiers: ['']
        },
        full: true
      },
      definitionProvider: true
    },
    serverInfo: {
      name: serverName
    }
  };
  return result;
});

connection.onInitialized(() => {});

connection.onDidChangeConfiguration((didChangeConfigurationParams) => {
  console.log('didChangeConfigurationParams');
  console.log(didChangeConfigurationParams);
});
connection.onHover((hoverParams: HoverParams) => {
  const uri = hoverParams.textDocument.uri;
  const document = documentManager.get(uri);
  if (document !== undefined) {
    let hoverPosition = hoverParams.position;
    if (document.getText()[document.offsetAt(hoverPosition)] === '\n') {
      // no hover for invisible newline / after last character
      return;
    }
    // getWordRangeAtPosition gets previous word for first character of next word
    hoverPosition.character += 1;
    const hoverOffset = document.offsetAt(hoverPosition);
    const documentData = documentManager.documentData.get(uri);
    if (!documentData) {
      return;
    }
    const tokenIdx = documentData.tokens.findIndex((token) => token[0] <= hoverOffset && hoverOffset <= token[0] + token[1]);
    const tokenData = documentData.tokens[tokenIdx];
    if (!tokenData) {
      return;
    }
    const tokenLine = hoverPosition.line;
    const tokenStartChar = document.positionAt(tokenData[0]).character;
    const tokenRange: Range = {
      start: {
        character: tokenStartChar,
        line: tokenLine
      },
      end: {
        character: tokenStartChar + tokenData[1],
        line: tokenLine
      }
    };
    // just show the hovered text
    // todo show type (macro, numeric, boolean, string, etc.)
    let tokenText = document.getText().substring(tokenData[0], tokenData[0] + tokenData[1]);
    let hoverText: string;
    let additionalInformation = '';
    if (tokenText[0] === '"') {
      // string token
      hoverText = 'string ' + tokenText;
    } else if (numericTokenPattern.test(tokenText)) {
      // numeric token
      hoverText = 'numeric ' + tokenText;
      additionalInformation += addNumericAdditionalInformation(tokenText);
    } else { // symbolic token
      const semanticHover = documentData.semanticHovers.get(tokenIdx);
      if (semanticHover) {
        hoverText = semanticHover;
      } else {
        hoverText = tokenText;
      }
    }
    const hoverContent: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: [
        '```metafont',
        hoverText,
        '```'
      ].join('\n')
    };
    if (additionalInformation) {
      hoverContent.value += '\n' + additionalInformation;
    }

    const hover: Hover = {
      contents: hoverContent,
      range: tokenRange
    };
    return hover;
  }
});
connection.languages.semanticTokens.on((semanticTokensParams: SemanticTokensParams) => {
  const uri = semanticTokensParams.textDocument.uri;
  const document = documentManager.get(uri);
  const documentData = documentManager.documentData.get(uri);
  const semanticTokenBuilder = new SemanticTokensBuilder();
  if (document !== undefined && documentData !== undefined) {
    for (const tokenIdx of documentData.semanticTokens.keys()) {
      const semanticToken = documentData.semanticTokens.get(tokenIdx);
      if (semanticToken?.tokenType !== undefined) {
        const tokenData = documentData.tokens[tokenIdx];
        const position = document.positionAt(tokenData[0]);
        const line = position.line;
        const char = position.character;
        const tokenType = tokenTypeList.indexOf(semanticToken.tokenType);
        semanticTokenBuilder.push(line, char, tokenData[1], tokenType, 0);
      }
    }
  }
  const tokens = semanticTokenBuilder.build();
  return tokens;
});
connection.onDefinition((definitionParams: DefinitionParams) => {
  const uri = definitionParams.textDocument.uri;
  const document = documentManager.get(uri);
  const documentData = documentManager.documentData.get(uri);
  if (document !== undefined && documentData !== undefined) {
    const link = documentData.inputs.find((link) =>
      // on same line and between start and end
      link.range.start.line === definitionParams.position.line
      && definitionParams.position.line === link.range.end.line
      && link.range.start.character <= definitionParams.position.character
      && definitionParams.position.character <= link.range.end.character
    );
    if (link !== undefined) {
      // If Location instead of LocationLink is provided, the characters underlined while pressing Ctrl (highlight for Ctrl+Click) are determined by vscode.LanguageConfiguration's wordPattern.
      let inputUri = link.inputUri;
      if (!inputUri.endsWith('.mf') && !existsSync(inputUri)) {
        inputUri += '.mf';
      }
      const locationLink: LocationLink = {
        originSelectionRange: link.range,
        targetUri: inputUri,
        targetRange: {
          start: {
            line: 0,
            character: 0
          },
          end: {
            line: 0,
            character: 0
          }
        },
        targetSelectionRange: {
          start: {
            line: 0,
            character: 0
          },
          end: document.positionAt(document.getText().length)
        }
      };
      return [ locationLink ];
    }
  }
});
connection.onDeclaration((declarationParams: DeclarationParams) => {
  const uri = declarationParams.textDocument.uri;
  const document = documentManager.get(uri);
  const documentData = documentManager.documentData.get(uri);
  if (document !== undefined && documentData !== undefined) {
    const tokenIdx = documentManager.getTokenIdxAtPosition(document, declarationParams.position);
    if (tokenIdx !== undefined && tokenIdx >= 0) {
      return documentData.declarations.get(tokenIdx);
    }
  }
});

documentManager.onDidClose((textDocumentChangeEvent) => {
  // todo
});
documentManager.onDidChangeContent((textDocumentChangeEvent) => {
  // todo
  // also called after initialized
});

// function validateTextDocument(document: TextDocument) {
//   documentManager.getTokens()
//   document.uri
// }

documentManager.listen(connection);

connection.listen();


function addNumericAdditionalInformation(numTokenStr: string) {
  // this assumes value of token >= 0
  let num = parseFloat(numTokenStr);
  let origNum = num;
  num = Math.min(num, 4096-1/65536);
  let additionalInformation = metafontNumericRepresentationExplanation(num);
  if (origNum > 4096-1/65536) {
    if (origNum > 32768-1/65536) {
      origNum = 32768-1/65536;
    }
    additionalInformation += `\\\n(during evaluation: ${metafontNumericRepresentationExplanation(origNum, true)})`;
  }
  return additionalInformation;
}

function metafontNumericRepresentationExplanation(num: number, forceOutput = false) {
  let additionalInformation = '';
  const numFloor = Math.floor(num);
  const fractionPart = Math.round((num - numFloor) * 65536);
  if (fractionPart !== 0) {
    if (numFloor !== 0) {
      additionalInformation = `${numFloor} `;
    }
    // <sup> / <sub> as well as css font-variant-numeric or font-feature-settings doesn't work in hovers
    additionalInformation += `${fractionPart}/65536 = ${(numFloor + fractionPart / 65536).toFixed(5)}`;
  } else if (forceOutput) {
    additionalInformation += `${(numFloor + fractionPart / 65536).toFixed(5)}`;
  }
  return additionalInformation;
}

