import { TextDocument } from 'vscode-languageserver-textdocument';
import { Connection, Declaration, Definition, Diagnostic, DiagnosticSeverity, DiagnosticTag, Position, Range, TextDocuments, URI } from 'vscode-languageserver/node';
import { IdentifierInfo, MetafontParser } from './metafontParser';
import { joinRegexes, nonAsciiCharPattern, numericTokenPattern, symbolicTokenPattern } from './regexes';


enum TokenKind {
  unknown = 0,
  symbolic = 1,
  numeric = 2,
  string = 3,
  incompleteString = 4,
  nonAsciiCharacter = 5
}
let tokenFlagI = 0;
export enum TokenFlag {
  ok = 0,
  ignore = 1 << tokenFlagI++, // e.g. token is not a token since it is part of a file name
  error = 1 << tokenFlagI++,
  unexpected = 1 << tokenFlagI++,
  unreachable = 1 << tokenFlagI++,
  multipleParseModes = 1 << tokenFlagI++,
  letRightHandSideDelimiterP218 = 1 << tokenFlagI++,
  missingNext = 1 << tokenFlagI++,
  confused = 1 << tokenFlagI++,
  forbiddenEndInLoop = 1 << tokenFlagI++,
  endInCondition = 1 << tokenFlagI++
}
export enum TokenType {
  function = 'function',
  parameter = 'parameter',
  operator = 'operator',
  keyword = 'keyword',
  string = 'string',
};

export type TokenData = [start: number, length: number, tokenKind: TokenKind, tokenFlag: TokenFlag];
export type SemanticToken = {
  tokenType?: TokenType,
  tokenModifiers?: []
};
export interface Input {
  range: Range,
  inputUri: URI,
  identifiersBeforeInput: Map<string, IdentifierInfo>
}
export interface DocumentData {
  uri: URI,
  tokens: TokenData[]; // input file name as mf tokens
  semanticHovers: Map<number, string>;
  semanticTokens: Map<number, SemanticToken>;
  declarations: Map<number, Declaration>;
  definitions: Map<number, Definition>
  inputs: Input[];
  identifiersAtEnd: Map<string, IdentifierInfo>;
};

const tokenPattern = joinRegexes([
  '(', symbolicTokenPattern, ')',
  '|(', numericTokenPattern, ')',
  /|"([^"\n]*)(?:"|(?=(\n)))/ // string
]);

export class MetafontDocumentManager extends TextDocuments<TextDocument> {
  connection: Connection;
  sourceStr: string;
  documentData = new Map<string, DocumentData>();
  /**
   * For some reason TextDocuments doesn't store more than 61 documents.
   * Instead of 62, 52 are returned by this.all() and this.keys(), and so on.
   * This also affects this.get() as it can't return all documents.
   */
  // 
  documents = new Map<string, TextDocument>();
  constructor(connection: Connection, sourceStr: string) {
    super(TextDocument);
    this.connection = connection;
    this.sourceStr = sourceStr;
    this.onDidChangeContent((textDocumentChangeEvent) => {
      const document = textDocumentChangeEvent.document;
      this.documents.set(document.uri, document);
      this.updateDocumentData(document);
    });
    this.listen(connection);
  }
  async initWithConnection() {
    // As soon as there is a connection, send a notification which triggers initialization on client side,
    // e.g. making the server aware of files.
    await this.connection.sendRequest('OpenAllFilesRequest');
    this.updateAllDocumentDataBasedOnInputs();
  }
  async updateDocumentData(document: TextDocument) {
    const tokens = this.tokenize(document.getText());
    this.documentData.set(document.uri, {
      uri: document.uri,
      tokens: tokens,
      semanticHovers: new Map<number, string>(),
      semanticTokens: new Map<number, SemanticToken>(),
      declarations: new Map<number, Declaration>(),
      definitions: new Map<number, Definition>(),
      inputs: [],
      identifiersAtEnd: new Map<string, IdentifierInfo>()
    });
    const parser = new MetafontParser(this);
    await parser.parseDocument(document);
    this.validateDocument(document);
    this.connection.languages.semanticTokens.refresh(); // recommend client to request semantic tokens again
  }
  async updateAllDocumentDataBasedOnInputs() {
    const toBeUpdated = [...this.documents.keys()];
    const numDocs = toBeUpdated.length;
    const maxUpdates = 10*numDocs; // infinite loop limit // TODO better criterion?
    for (let i = 1; i < maxUpdates && toBeUpdated.length > 0; i++) {
      const uri = toBeUpdated.shift();
      if (uri === undefined) {
        continue;
      }
      const document = this.documents.get(uri);
      if (document === undefined) {
        continue;
      }
      await this.updateDocumentData(document);
      const documentData = this.documentData.get(uri);
      if (documentData === undefined) {
        continue;
      }
      // Update this document again if it inputs files that still need to be updated.
      if (documentData.inputs.some((input) => toBeUpdated.includes(input.inputUri))) {
        toBeUpdated.push(uri);
      }
    }
  }

  tokenize(text: string) {
    let match: RegExpExecArray | null;
    let pattern = joinRegexes([tokenPattern, '|(', nonAsciiCharPattern, ')|(%.*)'], 'g');
    let tokens: TokenData[] = [];
    while (match = pattern.exec(text)) {
      let kind: TokenKind;
      let flags = TokenFlag.ok;
      if (match[1] !== undefined) {
        kind = TokenKind.symbolic;
      } else if (match[2] !== undefined) {
        kind = TokenKind.numeric;
      } else if (match[3] !== undefined) {
        if (match[4] !== undefined) {
          // match[4] is \n after unclosed "
          kind = TokenKind.incompleteString;
          flags &= TokenFlag.error;
        } else {
          kind = TokenKind.string;
        }
      } else if (match[5] !== undefined) {
        kind = TokenKind.nonAsciiCharacter;
      } else if (match[6] !== undefined) {
        // comment
        continue;
      } else {
        kind = TokenKind.unknown;
      }
      tokens.push([match.index, match[0].length, kind, flags]);
    }
    return tokens;
  }

  validateDocument(textDocument: TextDocument) {
    const documentData = this.documentData.get(textDocument.uri);
    if (documentData) {
      let diagnostics: Diagnostic[] = [];
      for (const tokenData of documentData.tokens) {
        if ([TokenKind.numeric, TokenKind.incompleteString, TokenKind.nonAsciiCharacter].includes(tokenData[2])) {
          const tokenStr = textDocument.getText().substring(tokenData[0], tokenData[0] + tokenData[1]);
          let message: string | undefined = undefined;
          let severity: DiagnosticSeverity | undefined = undefined;
          if (tokenData[2] === TokenKind.numeric) {
            if (parseInt(tokenStr) >= 4096) {
              message = `${tokenStr} is too large. METAFONT will complain: '! Enormous number has been reduced.'`;
              severity = DiagnosticSeverity.Warning;
            }
          } else if (tokenData[2] === TokenKind.incompleteString) {
            message = `${tokenStr}\\n is an incomplete string. METAFONT will complain: '! Incomplete string token has been flushed.'`;
            severity = DiagnosticSeverity.Error;
          } else if (tokenData[2] === TokenKind.nonAsciiCharacter) {
            message = `${tokenStr} is not a valid token. METAFONT will complain: '! Text line contains an invalid character.'`;
            severity = DiagnosticSeverity.Error;
          }
          if (message && severity) {
            diagnostics.push(this.createDiagnostic(message, textDocument, tokenData, severity));
          }
        }
        if ((tokenData[3] & TokenFlag.unexpected) === TokenFlag.unexpected) {
          diagnostics.push(this.createDiagnostic('Unexpected token.', textDocument, tokenData, DiagnosticSeverity.Error));
        }
        if ((tokenData[3] & TokenFlag.unreachable) === TokenFlag.unreachable) {
          diagnostics.push(this.createDiagnostic('Unreachable token.', textDocument, tokenData, DiagnosticSeverity.Hint, [ DiagnosticTag.Unnecessary ]));
        }
        if ((tokenData[3] & TokenFlag.multipleParseModes) === TokenFlag.multipleParseModes) {
          diagnostics.push(this.createDiagnostic('Something might be strange here.', textDocument, tokenData, DiagnosticSeverity.Warning));
        }
        if ((tokenData[3] & TokenFlag.letRightHandSideDelimiterP218) === TokenFlag.letRightHandSideDelimiterP218) {
          diagnostics.push(this.createDiagnostic('Right-hand symbol shouldn\'t be a delimiter.', textDocument, tokenData, DiagnosticSeverity.Warning, undefined, 'MFbook, p 218'));
        }
        if ((tokenData[3] & TokenFlag.endInCondition) === TokenFlag.endInCondition) {
          diagnostics.push(this.createDiagnostic('end occurred when if/elseif/else was incomplete', textDocument, tokenData, DiagnosticSeverity.Information));
        }
        if ((tokenData[3] & TokenFlag.forbiddenEndInLoop) === TokenFlag.forbiddenEndInLoop) {
          diagnostics.push(this.createDiagnostic('end is forbidden in a loop. METAFONT will complain: \'! Forbidden token found while scanning the text of a for/forsuffixes/forever loop.\'', textDocument, tokenData, DiagnosticSeverity.Error));
        }
      }
      this.connection.sendDiagnostics({
        uri: textDocument.uri,
        diagnostics: diagnostics
      });
    }
  }

  private createDiagnostic(message: string, textDocument: TextDocument, tokenData: TokenData, severity: DiagnosticSeverity, tags: DiagnosticTag[] | undefined = undefined, code: string | number | undefined = undefined): Diagnostic {
    return {
      message: message,
      range: this.getTokenRange(textDocument, tokenData),
      tags: tags,
      severity: severity,
      source: this.sourceStr,
      code: code
    };
  }

  getTokenIdxAtPosition(document: TextDocument, position: Position) {
    const offset = document.offsetAt(position);
    return this.getTokenIdxAtOffset(document, offset);
  }
  getTokenIdxAtOffset(document: TextDocument, offset: number) {
    const i = this.documentData.get(document.uri)?.tokens.findIndex((tokenData) => {
      return tokenData[0] <= offset && offset < tokenData[0] + tokenData[1];
    });
    return i;
  }

  getTokenRange(textDocument: TextDocument, tokenData: TokenData): Range {
    return {
      start: textDocument.positionAt(tokenData[0]),
      end: textDocument.positionAt(tokenData[0] + tokenData[1])
    };
  }

  async getDocumentData(document: TextDocument): Promise<DocumentData> {
    let documentData = this.documentData.get(document.uri);
    if (documentData) {
      return documentData;
    }
    await this.updateDocumentData(document);
    documentData = this.documentData.get(document.uri)!;// since document data was updated this is not undefined
    return documentData; 
  }
}
