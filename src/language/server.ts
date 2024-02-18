import { Position, TextDocument } from 'vscode-languageserver-textdocument';
import {
  CompletionItem,
  CompletionItemKind,
  CompletionParams,
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
  SemanticTokens,
  SemanticTokensBuilder,
  SemanticTokensParams,
  createConnection
} from 'vscode-languageserver/node';
import { DocumentData, MetafontDocumentManager, TokenFlag, TokenType } from './metafontDocumentManager';
import { numericTokenPattern } from './regexes';
import * as sparks from './sparks.json';


const serverName = 'METAFONT Language Server';

const connection = createConnection();
let documentManager = new MetafontDocumentManager(connection, serverName);
const tokenTypeList = Object.values(TokenType);
connection.onInitialize((_initializeParams: InitializeParams) => {
  const result: InitializeResult = {
    capabilities: {
      completionProvider: {}, // server provides it but without options
      declarationProvider: true,
      definitionProvider: true,
      hoverProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: tokenTypeList,
          tokenModifiers: ['']
        },
        full: true
      }
    },
    serverInfo: {
      name: serverName
    }
  };
  return result;
});

connection.onInitialized(() => {
  documentManager.initWithConnection();
});

connection.onDidChangeConfiguration((didChangeConfigurationParams) => {
  console.log('didChangeConfigurationParams');
  console.log(didChangeConfigurationParams);
});
connection.onHover((hoverParams: HoverParams) => {
  const uri = hoverParams.textDocument.uri;
  const document = documentManager.documents.get(uri);
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
    if (!tokenData || (tokenData[3] && TokenFlag.ignore) === TokenFlag.ignore) {
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
  const document = documentManager.documents.get(uri);
  const documentData = documentManager.documentData.get(uri);
  const semanticTokenBuilder = new SemanticTokensBuilder();
  if (document !== undefined && documentData !== undefined) {
    for (const tokenIdx of documentData.semanticTokens.keys()) {
      const tokenData = documentData.tokens[tokenIdx];
      if (tokenData === undefined || (tokenData[3] && TokenFlag.ignore === TokenFlag.ignore)) {
        continue;
      }
      const semanticToken = documentData.semanticTokens.get(tokenIdx);
      if (semanticToken?.tokenType === undefined) {
        continue;
      }
      const position = document.positionAt(tokenData[0]);
      const line = position.line;
      const char = position.character;
      const tokenType = tokenTypeList.indexOf(semanticToken.tokenType);
      semanticTokenBuilder.push(line, char, tokenData[1], tokenType, 0);
    }

    // Ensure the file name of inputs are strings (e.g. let generate=input;)
    for (const input of documentData.inputs) {
      const line = input.range.start.line;
      const char = input.range.start.character;
      const length = input.range.end.character - input.range.start.character;
      semanticTokenBuilder.push(line, char, length, tokenTypeList.indexOf(TokenType.string), 0);
    }
  }
  const tokens = semanticTokenBuilder.build();
  return sortSemanticTokens(tokens);
});
connection.onDefinition((definitionParams: DefinitionParams) => {
  const uri = definitionParams.textDocument.uri;
  const document = documentManager.documents.get(uri);
  const documentData = documentManager.documentData.get(uri);
  if (document !== undefined && documentData !== undefined) {
    const inputLinkLocations = getInputLinkLocations(document, documentData, definitionParams.position);
    if (inputLinkLocations !== undefined) {
      return inputLinkLocations;
    }
    const tokenIdx = documentManager.getTokenIdxAtPosition(document, definitionParams.position);
    if (tokenIdx !== undefined && tokenIdx >= 0) {
      return documentData.definitions.get(tokenIdx);
    }
  }
});
connection.onDeclaration((declarationParams: DeclarationParams) => {
  const uri = declarationParams.textDocument.uri;
  const document = documentManager.documents.get(uri);
  const documentData = documentManager.documentData.get(uri);
  if (document !== undefined && documentData !== undefined) {
    const inputLinkLocations = getInputLinkLocations(document, documentData, declarationParams.position);
    if (inputLinkLocations !== undefined) {
      return inputLinkLocations;
    }
    const tokenIdx = documentManager.getTokenIdxAtPosition(document, declarationParams.position);
    if (tokenIdx !== undefined && tokenIdx >= 0) {
      return documentData.declarations.get(tokenIdx);
    }
  }
});

connection.onCompletion((completionParams: CompletionParams) => {
  const completionItems: CompletionItem[] = [];

  // primitives
  for (const primitiveStr of sparks.primitives) {
    let completionItem: CompletionItem = {
      label: primitiveStr,
      detail: primitiveStr,
      kind: CompletionItemKind.Keyword // TODO ?
    };
    completionItems.push(completionItem);
  }
  
  // from document
  // TODO this strategy is not ideal
  const uri = completionParams.textDocument.uri;
  const document = documentManager.documents.get(uri);
  if (document === undefined) {
    return completionItems;
  }
  const documentData = documentManager.documentData.get(uri);
  if (documentData === undefined) {
    return completionItems;
  }
  const identifiersAtEnd = documentData.identifiersAtEnd;
  if (identifiersAtEnd === undefined) {
    return completionItems;
  }
  const completionPosition = completionParams.position;
  for (const [identifierStr, identifierInfo] of identifiersAtEnd) {
    if (
      identifierInfo.declarationTokens.every((tokenRef) => tokenRef.filePath === uri)
      && identifierInfo.declarationTokens.every((tokenRef) => {
        const declarationPosition = documentManager.getTokenRange(document, documentData.tokens[tokenRef.idx]);
        return (
          declarationPosition.end.line > completionPosition.line
          || (declarationPosition.end.line === completionPosition.line && declarationPosition.end.character > completionPosition.character)
        );
      })
    ) {
      continue; // ignore identifiers declared in this document after completion position
    }
    let completionItem: CompletionItem = {
      label: identifierStr,
      detail: identifierInfo.hover,
      kind: identifierInfo.completionItemKind
    };
    completionItems.push(completionItem);
  }
  return completionItems;
});

export type MfInputsRequestArgs = { uri: string };
export type MfInputsRequestInput = { uri: string };
export type MfInputsResponse = {
  inputs: MfInputsRequestInput[];
  inputtedBy: MfInputsRequestInput[];
};

export type OpenTextDocumentRequestArgs = { uri: string };
export type OpenTextDocumentResponse = void;

connection.onRequest('MfInputsRequest', async (args: MfInputsRequestArgs): Promise<MfInputsResponse> => {
  const mfInputResponse: MfInputsResponse = {
    inputs: [],
    inputtedBy: []
  };

  for (let [uri, documentData] of documentManager.documentData) {
    if (documentData.inputs.map((input) => input.inputUri).includes(args.uri)) {
      mfInputResponse.inputtedBy.push({ uri: uri });
    }
  }

  let documentData = documentManager.documentData.get(args.uri);
  if (documentData === undefined) {
    // try to get the document
    const openTextDocumentRequestArgs: OpenTextDocumentRequestArgs = { uri: args.uri };
    await connection.sendRequest<OpenTextDocumentResponse>('OpenTextDocumentRequest', openTextDocumentRequestArgs);
    // This seems to work. The key seems to be that TextDocuments.onDidChangeContent() makes the server aware of the document before the request's promise is fulfilled.
    // TODO This is most likely not a good long term solution.
    documentData = documentManager.documentData.get(args.uri);
    if (documentData === undefined) {
      // didn't work
      // TODO maybe try again after X ms?
      return mfInputResponse;
    }
  }
  mfInputResponse.inputs = documentData.inputs.map((input) => { return { uri: input.inputUri }; });
  return mfInputResponse;
});

connection.listen();


/**
 * VSCode seems to have problems with token data which is not ordered
 * (i.e. negative numbers in elements representing the line difference).
 * As a workaround, we sort tokens.data by line so there are no negative values.
 */
function sortSemanticTokens(tokens: SemanticTokens): SemanticTokens {
  const tokenDataSplitted = Array.from<unknown, number[]>(
    { length: tokens.data.length / 5 },
    (_, i) => tokens.data.slice(i * 5, (i + 1) * 5)
  );
  // make abs line and char number
  const tokenDataSplittedAbs = tokenDataSplitted.reduce<number[][]>(
    (accumulator, currentValue, currentIndex) => {
      accumulator.push([
        currentIndex === 0 ? currentValue[0] : currentValue[0] + accumulator[currentIndex - 1][0],
        ...currentValue.slice(1)
      ]);
      return accumulator;
    },
    []
  );
  tokenDataSplittedAbs.sort((a, b) => a[0] - b[0]);
  // turn back into differences
  const tokenDataSplittedSorted = tokenDataSplittedAbs.reduce<number[][]>(
    (accumulator, currentValue, currentIndex) => {
      accumulator.push([
        currentIndex === 0 ? currentValue[0] : currentValue[0] - tokenDataSplittedAbs[currentIndex - 1][0],
        ...currentValue.slice(1)
      ]);
      return accumulator;
    },
    []
  );
  // Build the SemanticTokens object with the sorted data reusing the resultId.
  tokens = {
    data: tokenDataSplittedSorted.flat(),
    resultId: tokens.resultId
  };
  return tokens;
}

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

function getInputLinkLocations(document: TextDocument, documentData: DocumentData, position: Position) {
  const link = documentData.inputs.find((link) =>
    // on same line and between start and end
    link.range.start.line === position.line
    && position.line === link.range.end.line
    && link.range.start.character <= position.character
    && position.character <= link.range.end.character
  );
  if (link !== undefined) {
    // If Location instead of LocationLink is provided, the characters underlined while pressing Ctrl (highlight for Ctrl+Click) are determined by vscode.LanguageConfiguration's wordPattern.
    const locationLink: LocationLink = {
      originSelectionRange: link.range,
      targetUri: link.inputUri,
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
