import { spawnSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/naming-convention
import * as _ from 'lodash';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionItemKind, Declaration, Definition } from 'vscode-languageserver/node';
import { Input, MetafontDocumentManager, SemanticToken, SigHelp, SigHelpParam, TokenData, TokenFlag, TokenType } from './metafontDocumentManager';
import { joinRegexes } from './regexes';
import * as sparks from './sparks.json';


let parseModeI = 0;
enum ParseMode {
  nothing = parseModeI++,
  multiple = parseModeI++, // todo
  notReachable = parseModeI++, // after end
  nextLineNotReachable = parseModeI++, // after endinput
  else = parseModeI++, // looking for elseif, else
  fi = parseModeI++, // looking for fi
  endfor = parseModeI++, // looking for endfor
  enddef = parseModeI++, // looking for enddef
  is = parseModeI++, // looking for = or :=
}

enum NestingBlockKind {
  if, elseif, else,
  condition,
  loop,
  macro
};
enum BodyTextKind {
  if, elseif, else,
  for
}
type BodyTextInfo = {
  bodyTextKind: BodyTextKind;
  identifiers?: Map<string, IdentifierInfo>;
  parseMode?: ParseMode;
};
type NestingBlockInfo = {
  kind: NestingBlockKind;
  parseMode: ParseMode;
  identifiersBeforeBlock?: Map<string, IdentifierInfo>;
  parseModesBeforeBlock?: ParseMode;
  bodyTexts?: BodyTextInfo[];
};

type TokenRef = {
  filePath: string;
  idx: number;
};

export type IdentifierInfo = {
  declarationTokens: TokenRef[];
  definitionTokens: TokenRef[];
  hover: string;
  signatureHelp?: SigHelp;
  tokenType?: TokenType;
  completionItemKind?: CompletionItemKind;
  replacement?: TokenRef;
};

const keywordCommandPattern = joinRegexes([
  '^(?:',
  'save',
  '|interim',
  // newinternal in storageTypePattern
  '|randomseed',
  '|let',
  '|delimiters',
  '|outer|inner', // protection command
  '|everyjob',
  '|show(?:variable|tokens|dependencies|stats)?', // show command
  '|message|err(?:message|help)', // message command
  '|(?:batch|nonstop|scroll|errorstop)mode', // mode command
  '|addto|cull', // picture command
  '|display|inwindow', // display command
  '|openwindow', // openwindow command
  '|shipout',
  '|special|numspecial',
  '|ligtable|::|\|\|:', // ligtable // no colon here
  ')$'
]);

const keywordControlPattern = joinRegexes([
  '^(?:',
  /if|else(?:if)?|fi/,
  /|for(?:suffixes|ever)?|step|until|exitif|endfor/,
  /|(?:var|primary|secondary|tertiary|end)?def/,
  /|end|dump/,
  /|input|endinput/,
  /|scantokens|expandafter|quote/,
  ')$'
]);

const keywordGroupingPattern = joinRegexes([
  '^(?:',
  'begingroup|endgroup',
  ')$'
]);

const storageTypePattern = joinRegexes([
  '^(?:',
  'boolean|string|path|pen|picture|transform|pair|numeric|newinternal',
  ')$'
]);

export class MetafontParser {
  documentManager: MetafontDocumentManager;
  constructor(documentManager: MetafontDocumentManager) {
    this.documentManager = documentManager;
  }

  async parseDocument(textDocument: TextDocument) {
    const documentData = this.documentManager.documentData.get(textDocument.uri);
    if (documentData === undefined) {
      return;
    }
    const tokens = documentData.tokens;
    const semanticHovers = documentData.semanticHovers;
    const semanticTokens = documentData.semanticTokens;
    const declarations = documentData.declarations;
    const definitions = documentData.definitions;
    const signatureHelps = documentData.signatureHelps;
    const inputs = documentData.inputs;

    let identifiers = new Map<string, IdentifierInfo>();
    let parseMode = ParseMode.nothing; 
    let nestingStructure: NestingBlockInfo[] = [];
    let tokenLine = 0;

    // Before looking into any tokens of this document, add identifiers from documents inputting this document.
    this.addIdentifiersFromInputtingDocuments(textDocument, identifiers);

    outerTokenLoop: for (let i = 0; i < tokens.length; i++) {
      let lastTokenLine = tokenLine;
      tokenLine = this.documentManager.getTokenRange(textDocument, tokens[i]).start.line;
      if (tokenLine !== lastTokenLine) {
        // this is the first token of a new line
        if (parseMode === ParseMode.nextLineNotReachable) {
          parseMode = ParseMode.notReachable;
        }
      }
      this.handleNotReachable(parseMode, tokens, i);
      const origTokenStr = this.getTokenStr(textDocument, i)!; // cannot be undefined due to loop condition

      const replacedTokenStr = this.replaceTokenStr(identifiers, origTokenStr);

      this.applyParserResults(i, origTokenStr, identifiers, semanticHovers, declarations, definitions, semanticTokens, signatureHelps);
      let hoverStr: string;
      let sigLabel: string;
      let params: SigHelpParam[];

      replacedTokenSwitch: switch (replacedTokenStr) {
      case 'if':
        nestingStructure.push({
          kind: NestingBlockKind.condition,
          parseMode: ParseMode.else,
          identifiersBeforeBlock: _.cloneDeep(identifiers),
          parseModesBeforeBlock: _.cloneDeep(parseMode),
          bodyTexts: [{
            bodyTextKind: BodyTextKind.if
          }]
        });
        break;
      case 'elseif':
        if (nestingStructure.at(-1)?.kind === NestingBlockKind.condition && nestingStructure.at(-1)?.parseMode === ParseMode.else) {
          const conditionalBlock = nestingStructure.at(-1)!;

          this.fixUnreachable(conditionalBlock, parseMode, tokens, i);

          // keep track of identifiers from previous block (previous if or elseif block)
          const prevBodyText = conditionalBlock.bodyTexts?.at(-1)!;
          prevBodyText.identifiers = _.cloneDeep(identifiers);
          prevBodyText.parseMode = parseMode;

          // for the next block (this elseif)
          identifiers = _.cloneDeep(conditionalBlock.identifiersBeforeBlock!);
          parseMode = _.cloneDeep(conditionalBlock.parseModesBeforeBlock!);
          conditionalBlock.bodyTexts?.push({
            bodyTextKind: BodyTextKind.elseif
          });
          // parseMode stays the same
        } else {
          tokens[i][3] |= TokenFlag.unexpected;
        }
        break;
      case 'else':
        if (nestingStructure.at(-1)?.kind === NestingBlockKind.condition && nestingStructure.at(-1)?.parseMode === ParseMode.else) {
          const conditionalBlock = nestingStructure.at(-1)!;

          this.fixUnreachable(conditionalBlock, parseMode, tokens, i);
          
          // keep track of identifiers, parseMode from previous block
          const prevBodyText = conditionalBlock.bodyTexts?.at(-1)!;
          prevBodyText.identifiers = _.cloneDeep(identifiers);
          prevBodyText.parseMode = parseMode;

          // for the next block
          identifiers = _.cloneDeep(conditionalBlock.identifiersBeforeBlock!);
          parseMode = conditionalBlock.parseModesBeforeBlock!;
          conditionalBlock.bodyTexts?.push({
            bodyTextKind: BodyTextKind.else
          });
          nestingStructure[nestingStructure. length-1].parseMode = ParseMode.fi;
        } else {
          tokens[i][3] |= TokenFlag.unexpected;
        }
        break;
      case 'fi':
        if (nestingStructure.at(-1)?.kind === NestingBlockKind.condition && [ParseMode.else, ParseMode.fi].includes(nestingStructure.at(-1)!.parseMode)) {
          const conditionalBlock = nestingStructure.at(-1)!;

          this.fixUnreachable(conditionalBlock, parseMode, tokens, i);

          const prevBodyText = conditionalBlock.bodyTexts?.at(-1)!;
          prevBodyText.identifiers = _.cloneDeep(identifiers);
          prevBodyText.parseMode = parseMode;

          identifiers = this.combineIdentifiers(nestingStructure.at(-1)!);
          parseMode = this.combineParseMode(nestingStructure.at(-1)!);
          nestingStructure.pop();
          if (parseMode === ParseMode.multiple) {
            tokens[i][3] |= TokenFlag.multipleParseModes;
            parseMode = ParseMode.nothing;
          }
        } else {
          tokens[i][3] |= TokenFlag.unexpected;
        }
        break;
      case 'for':
      case 'forsuffixes':
      case 'forever':
        nestingStructure.push({
          kind: NestingBlockKind.loop,
          parseMode: ParseMode.endfor,
          parseModesBeforeBlock: _.cloneDeep(parseMode),
          bodyTexts: [{
            bodyTextKind: BodyTextKind.for
          }]
        });
        break;
      case 'endfor':
        if (nestingStructure.at(-1)?.parseMode === ParseMode.endfor) {
          const loopBlock = nestingStructure.at(-1)!;

          // this is only valid if the loop was not executed (e.g. for i= : end endfor)
          // todo analyze if loop text is executed
          this.fixUnreachable(loopBlock, parseMode, tokens, i);

          nestingStructure.pop();
        } else {
          tokens[i][3] |= TokenFlag.unexpected;
        }
        break;
      case 'boolean':
      case 'numeric':
      case 'pair':
      case 'path':
      case 'pen':
      case 'picture':
      case 'string':
      case 'transform':
        i++;
        this.handleNotReachable(parseMode, tokens, i);
        let endOfDeclarationList = false;
        declaredVariableLoop: for (; i < tokens.length; i++) {
          this.handleNotReachable(parseMode, tokens, i);
          let declaredVariableParts: string[] = [];
          for (; i < tokens.length; i++) {
            this.handleNotReachable(parseMode, tokens, i);
            const symbolicTokenStr = this.getTokenStr(textDocument, i);
            if (symbolicTokenStr === undefined) {
              tokens[i - 1][3] |= TokenFlag.missingNext;
              break declaredVariableLoop;
            } else if (symbolicTokenStr === ';') {
              endOfDeclarationList = true;
              break;
            } else if (symbolicTokenStr === ',') {
              break;
            } else if (sparks.primitives.includes(symbolicTokenStr)) {
              // if no ; but a spark, there is something wrong.
              break declaredVariableLoop;
            } else {
              if (symbolicTokenStr === '[') {
                const closingBracketTokenStr = this.getTokenStr(textDocument, i + 1);
                if (closingBracketTokenStr !== ']') {
                  tokens[i + 1][3] |= TokenFlag.unexpected;
                  break;
                }
                declaredVariableParts.push('[]');
                i++; // continue after ]
                this.handleNotReachable(parseMode, tokens, i);
              } else {
                declaredVariableParts.push(symbolicTokenStr);
              }
            }
          }
          const declaredVariableRepresentation = declaredVariableParts.join('.');
          identifiers.set(declaredVariableRepresentation, {
            declarationTokens: [ { filePath: textDocument.uri, idx: i - 1 } ], // token before ; or , which broke the loop
            definitionTokens: [], // type declarations only declare
            hover: `${replacedTokenStr} ${declaredVariableRepresentation}`,
            completionItemKind: CompletionItemKind.Variable
          });
          if (endOfDeclarationList) {
            break;
          }
        }
        // i is ;
        break;
      case 'let':
        const leftHandTokenStr = this.getTokenStr(textDocument, i + 1);
        const isTokenStr = this.getTokenStr(textDocument, i + 2); // = or :=
        const rightHandTokenStr = this.getTokenStr(textDocument, i + 3);
        const semicolonTokenStr = this.getTokenStr(textDocument, i + 4);
        if (
          leftHandTokenStr === undefined
          || isTokenStr === undefined
          || !['=', ':='].includes(isTokenStr)
          || rightHandTokenStr === undefined
          || semicolonTokenStr !== ';'
        ) {
          // this let command is strange
          break;
        }
        this.handleNotReachable(parseMode, tokens, i + 1); // left hand token
        this.handleNotReachable(parseMode, tokens, i + 2); // = or :=
        this.handleNotReachable(parseMode, tokens, i + 3); // right hand token
        this.handleNotReachable(parseMode, tokens, i + 4); // ;
        let identifierInfo: IdentifierInfo = {
          declarationTokens: [{ filePath: textDocument.uri, idx: i + 1 }],
          definitionTokens: [{ filePath: textDocument.uri, idx: i + 1 }], // todo maybe use definition of replacement ?
          hover: `let ${leftHandTokenStr} = ${rightHandTokenStr};`,
          replacement: { filePath: textDocument.uri, idx: i + 3 }
        };
        const rightHandHover = identifiers.get(rightHandTokenStr);
        if (rightHandHover !== undefined) {
          // for more context add hover current info of right hand side
          identifierInfo.hover += `\n ${rightHandHover.hover}`; // space for indentation
        }

        // semantic highlighting and completion for tokens defined by let
        const rightHandReplacedTokenStr = this.replaceTokenStr(identifiers, rightHandTokenStr);
        if (identifiers.has(rightHandTokenStr)) {
          if (identifiers.get(rightHandTokenStr)!.tokenType !== undefined) {
            identifierInfo.tokenType = identifiers.get(rightHandTokenStr)!.tokenType;
          }
          if (identifiers.get(rightHandTokenStr)!.completionItemKind !== undefined) {
            identifierInfo.completionItemKind = identifiers.get(rightHandTokenStr)!.completionItemKind;
          }
        } else if (keywordCommandPattern.test(rightHandReplacedTokenStr)) {
          identifierInfo.tokenType = TokenType.keywordCommand;
          identifierInfo.completionItemKind = CompletionItemKind.Keyword;
        } else if (keywordControlPattern.test(rightHandReplacedTokenStr)) {
          identifierInfo.tokenType = TokenType.keywordControl;
          identifierInfo.completionItemKind = CompletionItemKind.Keyword;
        } else if (keywordGroupingPattern.test(rightHandReplacedTokenStr)) {
          identifierInfo.tokenType = TokenType.keywordGrouping;
          identifierInfo.completionItemKind = CompletionItemKind.Keyword;
        } else if (storageTypePattern.test(rightHandReplacedTokenStr)) {
          identifierInfo.tokenType = TokenType.storageType;
          identifierInfo.completionItemKind = CompletionItemKind.Keyword; // this seems to be the best CompletionItemKind
        }
        identifiers.set(leftHandTokenStr, identifierInfo);

        if (['(', ')'].includes(rightHandTokenStr)) { // [The METAFONTbook, p 218]
          tokens[i + 3][3] |= TokenFlag.letRightHandSideDelimiterP218;
        }
        this.applyParserResults(i + 1, leftHandTokenStr, identifiers, semanticHovers, declarations, definitions, semanticTokens, signatureHelps); // left hand
        this.applyParserResults(i + 3, rightHandTokenStr, identifiers, semanticHovers, declarations, definitions, semanticTokens, signatureHelps); // right hand
        i += 4;
        break;
      case 'def':
      case 'vardef':
        i++; // continue with symbolic token (macro name)
        this.handleNotReachable(parseMode, tokens, i);
        let declaredVariableStr = this.getTokenStr(textDocument, i);
        if (declaredVariableStr === undefined) {
          break;
        }
        let declaredVariableI = i;
        i++; // continue after symbolic token (after first part of macro name)
        this.handleNotReachable(parseMode, tokens, i);
        // collect suffixes
        for (; i < tokens.length; i++) {
          this.handleNotReachable(parseMode, tokens, i);
          let nextTokenStr = this.getTokenStr(textDocument, i);
          if (nextTokenStr === undefined) {
            break outerTokenLoop;
          }
          if (['@#', '(', 'expr', 'suffix', 'text', '=', ':='].includes(nextTokenStr)) {
            break;
          } else if (nextTokenStr === '[' && this.getTokenStr(textDocument, i+1) === ']') {
            declaredVariableStr += '[]';
            i++; // because [] are 2 tokens
            this.handleNotReachable(parseMode, tokens, i);
          } else {
            if (declaredVariableStr.at(-1) !== ']') {
              declaredVariableStr += '.';
            }
            declaredVariableStr += nextTokenStr;
          }
        }
        // todo add defSymbolicTokenStr to identifiers within the definition (recursive expansion)
        hoverStr = `${replacedTokenStr} ${declaredVariableStr}`;
        sigLabel = `${replacedTokenStr} ${declaredVariableStr}`;
        params = [];
        this.handleNotReachable(parseMode, tokens, i);
        let nextTokenStr = this.getTokenStr(textDocument, i);
        i++;
        this.handleNotReachable(parseMode, tokens, i);
        if (nextTokenStr === '@#') {
          hoverStr += '@#';
          sigLabel += '@#';
          params.push({label: [sigLabel.length-2, sigLabel.length], isDelimited: false, paramType: '@#'});
          // todo add @# to identifiers within the definition
          this.handleNotReachable(parseMode, tokens, i);
          nextTokenStr = this.getTokenStr(textDocument, i);
          i++; // continue after @#
          this.handleNotReachable(parseMode, tokens, i);
        }
        if (nextTokenStr === undefined) {
          break;
        }
        let lastParameterTypeTokenStr: string | undefined = undefined;
        while (nextTokenStr === '(') {
          // i should be first token after (
          // parse delimited arg
          this.handleNotReachable(parseMode, tokens, i);
          let parameterType: string;
          const parameterTypeTokenStr = this.getTokenStr(textDocument, i);
          if (lastParameterTypeTokenStr === undefined) {
            hoverStr += `(${parameterTypeTokenStr} `;
            sigLabel += `(${parameterTypeTokenStr} `;
            parameterType = parameterTypeTokenStr!;
          } else if (lastParameterTypeTokenStr !== parameterTypeTokenStr) {
            // not the first delimited parameter
            hoverStr += `)(${parameterTypeTokenStr} `;
            sigLabel += `)(${parameterTypeTokenStr} `;
            parameterType = parameterTypeTokenStr!;
          } else {
            // delimited parameter with same parameter type
            hoverStr += `,`; // todo maybe don't do this
            sigLabel += `,`; // todo maybe don't do this
            parameterType = parameterType!; // it's known, reuse it
          }
          i++; // continue with parameter token
          while (nextTokenStr !== ')') {
            this.handleNotReachable(parseMode, tokens, i);
            const parameterTokenStr = this.getTokenStr(textDocument, i);
            hoverStr += parameterTokenStr;
            sigLabel += parameterTokenStr;
            params.push({label: [sigLabel.length-parameterTokenStr!.length, sigLabel.length], isDelimited: true, paramType: parameterType});
            i++; // go to token after parameter: , or )
            this.handleNotReachable(parseMode, tokens, i);
            nextTokenStr = this.getTokenStr(textDocument, i); // should be , or )
            if (nextTokenStr === undefined || ![',', ')'].includes(nextTokenStr)) {
              break; // something is strange here
            } else if (nextTokenStr === ',') {
              hoverStr += ',';
              sigLabel += ',';
            } // else it's ), increase i and break loop with while condition
            i++; // continue after , or )
          }
          this.handleNotReachable(parseMode, tokens, i);
          nextTokenStr = this.getTokenStr(textDocument, i);
          i++; // continue after ) (undelimited parameter type or =)
          this.handleNotReachable(parseMode, tokens, i);
          lastParameterTypeTokenStr = parameterTypeTokenStr;
        }
        if (lastParameterTypeTokenStr !== undefined) {
          // there were delimited parameters
          hoverStr += `)`;
          sigLabel += `)`;
        }
        if (nextTokenStr === undefined) {
          break;
        }
        if (['primary', 'secondary', 'tertiary', 'expr', 'suffix', 'text'].includes(nextTokenStr)) {
          this.handleNotReachable(parseMode, tokens, i);
          if (lastParameterTypeTokenStr === undefined) { // delimited parameters
            // space between declared variable and undelimited parameter type
            hoverStr += ' ';
            sigLabel += ' ';
          }
          let parameterToken  = this.getTokenStr(textDocument, i);
          hoverStr += `${nextTokenStr} ${parameterToken}`;
          sigLabel += `${nextTokenStr} ${parameterToken}`;
          params.push({label: [sigLabel.length-parameterToken!.length, sigLabel.length], isDelimited: false, paramType: nextTokenStr});
          i++; // continue after parameter token (of = :=)
          if (nextTokenStr === 'expr') {
            this.handleNotReachable(parseMode, tokens, i);
            const ofTokenStr = this.getTokenStr(textDocument, i);
            if (ofTokenStr === 'of') {
              i++;
              this.handleNotReachable(parseMode, tokens, i);
              parameterToken  = this.getTokenStr(textDocument, i);
              i++;
              hoverStr += ` of ${parameterToken}`;
              sigLabel += ` of ${parameterToken}`;
              params.push({label: [sigLabel.length-parameterToken!.length, sigLabel.length], isDelimited: false, paramType: 'of'});
            }
          }
          this.handleNotReachable(parseMode, tokens, i);
          nextTokenStr = this.getTokenStr(textDocument, i);
        }
        if (nextTokenStr === undefined || !['=', ':='].includes(nextTokenStr)) {
          // giving up
          break;
        }
        identifiers.set(declaredVariableStr, {
          declarationTokens: [{ filePath: textDocument.uri, idx: declaredVariableI }],
          definitionTokens: [{ filePath: textDocument.uri, idx: declaredVariableI }],
          hover: hoverStr,
          signatureHelp: {
            isParam: false,
            label: sigLabel,
            parameters: params
          },
          tokenType: TokenType.function,
          completionItemKind: CompletionItemKind.Function
        });
        nestingStructure.push({ kind: NestingBlockKind.macro, parseMode: ParseMode.enddef });
        i--; // i will be increased by loop
        break;
      case 'primarydef':
      case 'secondarydef':
      case 'tertiarydef':
        const leftParameterTokenStr = this.getTokenStr(textDocument, i + 1);
        const leveldevSymbolicTokenStr = this.getTokenStr(textDocument, i + 2);
        const rightParameterTokenStr = this.getTokenStr(textDocument, i + 3);
        if (leftParameterTokenStr === undefined || leveldevSymbolicTokenStr === undefined || rightParameterTokenStr === undefined) {
          break;
        }
        this.handleNotReachable(parseMode, tokens, i + 1);
        this.handleNotReachable(parseMode, tokens, i + 2);
        this.handleNotReachable(parseMode, tokens, i + 3);
        hoverStr = `${replacedTokenStr} ${leftParameterTokenStr} ${leveldevSymbolicTokenStr} ${rightParameterTokenStr}`;
        identifiers.set(leveldevSymbolicTokenStr, {
          declarationTokens: [{ filePath: textDocument.uri, idx: i + 2 }],
          definitionTokens: [{ filePath: textDocument.uri, idx: i + 2 }],
          hover: hoverStr,
          tokenType: TokenType.function, // TODO maybe operator?
          completionItemKind: CompletionItemKind.Operator
        });
        nestingStructure.push({kind: NestingBlockKind.macro, parseMode: ParseMode.enddef});
        i += 4;
        break;
      case 'enddef':
        // A definition can begin a conditional without ending it, look for enddef requirement in all nesting depths.
        const structureIndex = nestingStructure.map((s) => s.parseMode).findLastIndex((m) => m === ParseMode.enddef);
        if (structureIndex >= 0) {
          nestingStructure.length = structureIndex; // remove macro and deeper nesting levels
        } else {
          tokens[i][3] |= TokenFlag.unexpected;
        }
        break;
      case 'end':
        if (nestingStructure.some((s) => s.kind === NestingBlockKind.loop)) {
          tokens[i][3] |= TokenFlag.forbiddenEndInLoop;
        }
        if (nestingStructure.some((s) => s.kind === NestingBlockKind.condition)) {
          tokens[i][3] |= TokenFlag.endInCondition;
        }
        parseMode = ParseMode.notReachable;
        break;
      case 'endinput':
        parseMode = ParseMode.nextLineNotReachable;
        break;
      case 'input':
        const inputTokenRange = this.documentManager.getTokenRange(textDocument, tokens[i]);
        const lineNum = inputTokenRange.end.line;
        const line = textDocument.getText().split('\n')[lineNum];
        const lineAfterInput = line.slice(inputTokenRange.end.character);
        const filenameMatch = lineAfterInput.match(/^\s*([^\s;]*)/d);
        if (filenameMatch === null || filenameMatch.indices === undefined) {
          break;
        }
        // turn relative paths into absolute paths using cwd (workspace)
        let inputPath = path.resolve(filenameMatch[1]);
        if (!inputPath.endsWith('.mf') && !existsSync(inputPath) && existsSync(inputPath + '.mf')) {
          inputPath += '.mf';
        }
        if (!existsSync(inputPath)) {
          // cannot find in cwd (workspace)
          // use kpsewhich to find file
          const ret = spawnSync('kpsewhich', ['-format=mf', filenameMatch[1]]);
          if (ret.status === 0) {
            inputPath = ret.stdout.toString().split('\n')[0].trim(); // first line of output
          }
        }
        const inputUri = pathToFileURL(inputPath).toString();
        const startChar = inputTokenRange.end.character + filenameMatch.indices[1][0];
        const endChar = inputTokenRange.end.character + filenameMatch.indices[1][1];
        const startPos = {character: startChar, line: lineNum};
        const endPos = {character: endChar, line: lineNum};
        const input: Input = {
          range: {
            start: startPos,
            end: endPos
          },
          inputUri: inputUri,
          identifiersBeforeInput: _.cloneDeep(identifiers)
        };
        inputs.push(input);

        // Ignore anything that was identified as a token where the filename/path is.
        if (i+1 < tokens.length) {
          let nextTokenRange = this.documentManager.getTokenRange(textDocument, tokens[i+1]);
          while (nextTokenRange.end.line === lineNum && nextTokenRange.end.character <= endChar) {
            tokens[i+1][3] |= TokenFlag.ignore;
            i++;
            if (i+1 >= tokens.length) {
              break;
            }
            nextTokenRange = this.documentManager.getTokenRange(textDocument, tokens[i+1]);
          }
        }

        // try to include identifiers from input file
        const inputDocumentData = this.documentManager.documentData.get(inputUri);
        if (inputDocumentData !== undefined) {
          identifiers = new Map<string, IdentifierInfo>([...identifiers, ...inputDocumentData.identifiersAtEnd]);
        }
        break;
      default:
        const mainIdentifierInfo = identifiers.get(replacedTokenStr);
        if (mainIdentifierInfo === undefined) {
          break;
        }
        if (mainIdentifierInfo.tokenType === TokenType.function) {
          if (mainIdentifierInfo.signatureHelp === undefined || mainIdentifierInfo.signatureHelp.isParam) {
            break;
          }

          // TODO macro names with multiple tokens (vardef)
          const mainTokenIdx = i;
          i++; // go to next token after macro name
          let p = 0;
          params = mainIdentifierInfo.signatureHelp.parameters;
          let nextTokenStr: string | undefined;

          // @#
          if (params[p].paramType === '@#') {
            for (; i < tokens.length; i++) {
              nextTokenStr = this.getTokenStr(textDocument, i);
              if (nextTokenStr === undefined) {
                break outerTokenLoop;
              }
              // TODO replacement (let)
              if (nextTokenStr === '(' || sparks.primitives.includes(nextTokenStr)) {
                break; // end of suffix
              }
              signatureHelps.set(i, {
                isParam: true,
                mainTokenIdx: mainTokenIdx,
                param: p
              });
            }
            p++;
          }

          // delimited parameters
          nextTokenStr = this.getTokenStr(textDocument, i);
          if (nextTokenStr === undefined) {
            break outerTokenLoop;
          }
          let inDelimiters = false;
          let delimiterDepth = 0; // TODO different delimiters, matching pairs of different delimiters
          while (i < tokens.length && p < params.length && params[p].isDelimited) {
            if (!inDelimiters) {
              if (nextTokenStr === '(') {
                delimiterDepth++;
                signatureHelps.set(i, {
                  isParam: true,
                  mainTokenIdx: mainTokenIdx,
                  param: p
                });
                inDelimiters = true;
              } else { // nextTokenStr !== '('
                tokens[i][3] |= TokenFlag.tooFewDelimitedParameters;
                break replacedTokenSwitch;
              }
            } else { // inDelimiters
              if (nextTokenStr === '(') {
                delimiterDepth++;
              } else if (nextTokenStr === ')') {
                delimiterDepth--;
                if (delimiterDepth === 0){
                  p++;
                  inDelimiters = false;
                }
              } else if (nextTokenStr === ',' && params[p].paramType !== 'text') {
                // delimited text only ends with )
                // , is allowed in text argument
                // [The METAFONTbook, p. 166, 249]
                p++;
              } // else token i is part of the delimited argument
              signatureHelps.set(i, {
                isParam: true,
                mainTokenIdx: mainTokenIdx,
                param: p
              });
            }
            i++; // next token
            nextTokenStr = this.getTokenStr(textDocument, i);
            if (nextTokenStr === undefined) {
              break outerTokenLoop;
            }
          }
          if ((p >= params.length || !params[p].isDelimited) && inDelimiters) {
            tokens[i][3] |= TokenFlag.tooManyDelimitedParameters;
          }

          // undelimited parameters
          if (p >= params.length) {
            // end of parameters, no undelimited parameters
            break;
          }
          nextTokenStr = this.getTokenStr(textDocument, i);
          if (nextTokenStr === undefined) {
            break outerTokenLoop;
          }
          if (['=', ':='].includes(nextTokenStr)) {
            if (['primary', 'secondary', 'tertiary', 'expr'].includes(params[p].paramType)) {
              signatureHelps.set(i, {
                isParam: true,
                mainTokenIdx: mainTokenIdx,
                param: p
              });
              i++;
              nextTokenStr = this.getTokenStr(textDocument, i);
              if (nextTokenStr === undefined) {
                break outerTokenLoop;
              }
            } else if (params[p].paramType === 'suffix') {
              tokens[i][3] |= TokenFlag.undelimitedSuffixParameterWithIs;
            }
          }
          // METAFONT allows (<suffix>) as undelimited parameter
          inDelimiters = false;
          if (params[p].paramType === 'suffix' && nextTokenStr === '(') {
            inDelimiters = true;
            signatureHelps.set(i, {
              isParam: true,
              mainTokenIdx: mainTokenIdx,
              param: p
            });
            i++;
            nextTokenStr = this.getTokenStr(textDocument, i);
            if (nextTokenStr === undefined) {
              break outerTokenLoop;
            }
          }
          let groupDepth = 0;
          while (i < tokens.length) {
            let breakAfterThis = false;
            if (nextTokenStr === ';') {
              // end of undelimited argument
              break replacedTokenSwitch;
            } else if (nextTokenStr === 'begingroup') {
              groupDepth++;
            } else if (nextTokenStr === 'endgroup') {
              if (groupDepth === 0) {
                // end of undelimited parameter
                break replacedTokenSwitch;
              } else {
                groupDepth--;
              }
            } else if (nextTokenStr === 'end') {
              // end of undelimited parameter
              break replacedTokenSwitch;
            } else if (params[p].paramType === 'expr' && nextTokenStr === 'of') {
              if (p+1 < params.length && params[p+1].paramType === 'of') {
                p++;
              }
            } else if (params[p].paramType !== 'text' && sparks.primitives.includes(nextTokenStr)) {
              // text is the only parameter type that can include sparks
              // otherwise: end of undelimited parameter
              break replacedTokenSwitch;
            } else if (inDelimiters && nextTokenStr === ')') {
              breakAfterThis = true;
            }
            signatureHelps.set(i, {
              isParam: true,
              mainTokenIdx: mainTokenIdx,
              param: p
            });
            i++;
            nextTokenStr = this.getTokenStr(textDocument, i);
            if (nextTokenStr === undefined) {
              break outerTokenLoop;
            }
            if (breakAfterThis) {
              break replacedTokenSwitch;
            }
          }
        }
      }
    }

    // Save identifiers in case this file is input.
    documentData.identifiersAtEnd = identifiers;
  }

  private addIdentifiersFromInputtingDocuments(textDocument: TextDocument, identifiers: Map<string, IdentifierInfo>) {
    // Adds identifiers that are the same before all inputs.
    // This is based on the assumption that inputted mf files are not used as job files.

    const inputtingDocumentData = [...this.documentManager.documentData.values()].filter(
      (documentData) => documentData.inputs.some((input) => input.inputUri === textDocument.uri)
    );
    const inputtingInputs = inputtingDocumentData.flatMap((document) => document.inputs.filter(
      (input) => input.inputUri === textDocument.uri)
    );
    const identifiersBeforeInputs = inputtingInputs.map((input) => _.cloneDeep(input.identifiersBeforeInput));
    const identifierNamesBeforeInputs = identifiersBeforeInputs.map((identifiersBeforeInput) => [...identifiersBeforeInput.keys()]);
    if (identifierNamesBeforeInputs.length === 0) {
      return;
    }

    const identifierNamesBeforeAllInputs = identifierNamesBeforeInputs.reduce(
      (identifierNamesAcc, identifierNamesCur) => identifierNamesAcc.filter((identifierName) => identifierNamesCur.includes(identifierName))
    );
    identifierNameLoop: for (const identifierName of identifierNamesBeforeAllInputs) {
      const identifierInfo = identifiersBeforeInputs[0].get(identifierName)!; // filtered above so this is not undefined
      for (const identifiersBeforeInput of identifiersBeforeInputs.slice(1)) {
        const identifierInfo_ = identifiersBeforeInput.get(identifierName)!; // filtered above so this is not undefined
        if (identifierInfo.hover !== identifierInfo_.hover) {
          // TODO maybe some combination instead ?
          continue identifierNameLoop;
        }
        if (JSON.stringify(identifierInfo.replacement) !== JSON.stringify(identifierInfo_.replacement)) {
          continue identifierNameLoop;
        }
        if (identifierInfo.tokenType !== identifierInfo_.tokenType) {
          continue identifierNameLoop;
        }
        identifierInfo.declarationTokens.push(...identifierInfo_.declarationTokens);
        identifierInfo.definitionTokens.push(...identifierInfo_.definitionTokens);
      }

      // If not continued outer loop, this identifier has similar meanings.
      identifiers.set(identifierName, identifierInfo);
    }
  }

  private handleNotReachable(parseMode: ParseMode, tokens: TokenData[], i: number) {
    if (parseMode === ParseMode.notReachable) {
      tokens[i][3] = TokenFlag.unreachable;
    }
  }

  /**
   * In some cases (elseif, else, fi), the parseMode is set incorrectly and needs to be fixed.
   */
  private fixUnreachable(conditionalBlock: NestingBlockInfo, parseMode: ParseMode, tokens: TokenData[], i: number) {
    // if parseMode changed
    if (conditionalBlock.parseModesBeforeBlock !== undefined && conditionalBlock.parseModesBeforeBlock !== parseMode) {
      tokens[i][3] &= ~TokenFlag.unreachable; // turn off
      if (conditionalBlock.parseModesBeforeBlock === ParseMode.notReachable) {
        // turn on according to parseModesBeforeBlock
        tokens[i][3] |= TokenFlag.unreachable;
      }
    }
  }

  combineIdentifiers(nestedBlockInfo: NestingBlockInfo): Map<string, IdentifierInfo> {
    let identifiers = _.cloneDeep(nestedBlockInfo.identifiersBeforeBlock!); // start with the identifiers before the block
    const bodyTextIdentifierNames = [...new Set(nestedBlockInfo.bodyTexts!.reduce<string[]>((a, b) => {
      if (b.identifiers) {
        return a.concat(...b.identifiers.keys());
      } else {
        return a;
      }
    }, []))];
    for (const identifierName of bodyTextIdentifierNames) {
      if (![...identifiers.keys()].includes(identifierName)) { // check if it is new
        // new
        const declarationTokens = nestedBlockInfo.bodyTexts!.reduce<TokenRef[]>((tokenRefs, bodyTextInfo) => {
          if (bodyTextInfo.identifiers!.has(identifierName)) {
            return [...tokenRefs, ...bodyTextInfo.identifiers!.get(identifierName)!.declarationTokens];
          } else {
            return tokenRefs;
          }
        }, []);
        const definitionTokens = nestedBlockInfo.bodyTexts!.reduce<TokenRef[]>((tokenRefs, bodyTextInfo) => {
          if (bodyTextInfo.identifiers!.has(identifierName)) {
            return [...tokenRefs, ...bodyTextInfo.identifiers!.get(identifierName)!.definitionTokens];
          } else {
            return tokenRefs;
          }
        }, []);
        const hover = nestedBlockInfo.bodyTexts!.reduce<string>((hover, bodyTextInfo) => {
          if (hover.length > 0) {
            hover += '\n';
          }
          if (bodyTextInfo.identifiers!.has(identifierName)) {
            return hover + bodyTextInfo.identifiers!.get(identifierName)!.hover;
          } else {
            return hover + 'unknown';
          }
        }, '');
        let tokenType: TokenType | undefined;
        if ((nestedBlockInfo.bodyTexts!).length === 1) {
          tokenType = nestedBlockInfo.bodyTexts![0].identifiers?.get(identifierName)?.tokenType;
        };
        let completionItemKind: CompletionItemKind | undefined;
        if ((nestedBlockInfo.bodyTexts!).length === 1) {
          completionItemKind = nestedBlockInfo.bodyTexts![0].identifiers?.get(identifierName)?.completionItemKind;
        };
        let replacement: TokenRef | undefined;
        if ((nestedBlockInfo.bodyTexts!).length === 1) {
          replacement = nestedBlockInfo.bodyTexts![0].identifiers?.get(identifierName)?.replacement;
        };
        const identifierInfo: IdentifierInfo = {
          declarationTokens: declarationTokens,
          definitionTokens: definitionTokens,
          hover: hover,
          tokenType: tokenType,
          completionItemKind: completionItemKind,
          replacement: replacement
        };
        identifiers.set(identifierName, identifierInfo);
      }
      else {
        // todo check if original can survive block, i.e. is it redefined in each case (and there is an else body text)
        for (const bodyTextInfo of nestedBlockInfo.bodyTexts!) {
          const identifierInfo = identifiers.get(identifierName)!; // it is not new
          const bodyTextIdentifierInfo = bodyTextInfo.identifiers?.get(identifierName);
          if (
            bodyTextIdentifierInfo
            && !_.isEqual(bodyTextIdentifierInfo, identifierInfo)
          ) { // identifierName existed before block and changed in current body text
            identifierInfo.hover += '\n' + bodyTextIdentifierInfo.hover;
            identifierInfo.declarationTokens.push(...bodyTextIdentifierInfo.declarationTokens) ;
          }
        }
      }
    }
    return identifiers;
  }
  private combineParseMode(nestedBlockInfo: NestingBlockInfo): ParseMode {
    const elseBodyText = nestedBlockInfo.bodyTexts!.find((bodyText) => bodyText.bodyTextKind === BodyTextKind.else);
    const parseMode = elseBodyText === undefined ? nestedBlockInfo.parseModesBeforeBlock! : elseBodyText.parseMode!;
    if (nestedBlockInfo.bodyTexts!.some((bodyText) => bodyText.parseMode !== parseMode && bodyText.parseMode !== ParseMode.notReachable)) { // Else might be checked against itself here, but filtering is not worth it.
      return ParseMode.multiple;
    }
    return parseMode;
  }

  private applyParserResults(i: number, origTokenStr: string, identifiers: Map<string, IdentifierInfo>, semanticHovers: Map<number, string>, declarations: Map<number, Declaration>, definitions: Map<number, Definition>, semanticTokens: Map<number, SemanticToken>, SignatureHelps: Map<number, SigHelp>) {
    this.addSemanticInfo(i, origTokenStr, identifiers, semanticHovers);
    this.addTokenLocationLinks(i, origTokenStr, identifiers, declarations, "declarationTokens");
    this.addTokenLocationLinks(i, origTokenStr, identifiers, definitions, "definitionTokens");
    this.addSemanticToken(i, origTokenStr, identifiers, semanticTokens);
    this.addSignatureHelp(i, origTokenStr, identifiers, SignatureHelps);
  }

  private replaceTokenStr(identifiers: Map<string, IdentifierInfo>, replacedTokenStr: string) {
    let i = 0;
    const imax = 100; // limit
    while (identifiers.has(replacedTokenStr) && i < imax) {
      const replacement = identifiers.get(replacedTokenStr)!.replacement;
      if (replacement === undefined) {
        break;
      }
      const uri = replacement.filePath;
      const textDocument = this.documentManager.documents.get(uri);
      if (textDocument === undefined) {
        break;
      }
      const newTokenStr = this.getTokenStr(textDocument, replacement.idx);
      if (newTokenStr && newTokenStr !== replacedTokenStr) {
        replacedTokenStr = newTokenStr;
        i++;
      }
    }
    return replacedTokenStr;
  }

  private addSemanticInfo(i: number, tokenStr: string, identifiers: Map<string, IdentifierInfo>, semanticHovers: Map<number, string>, ) {
    const identifierInfo = identifiers.get(tokenStr);
    if (identifierInfo !== undefined) {
      semanticHovers.set(i, identifierInfo.hover);
    }
  }
  private addTokenLocationLinks(i: number, tokenStr: string, identifiers: Map<string, IdentifierInfo>, declarationsOrDefinitions: Map<number, Declaration | Definition>, key: "declarationTokens" | "definitionTokens" ) {
    const identifierInfo = identifiers.get(tokenStr);
    if (identifierInfo === undefined) {
      return;
    }
    const tokenLocationLinks: Declaration | Definition = [];
    for (const declarationOrDeclarationToken of identifierInfo[key]) {
      const uri = declarationOrDeclarationToken.filePath;
      const documentData = this.documentManager.documentData.get(uri);
      const textDocument = this.documentManager.documents.get(uri);
      if (textDocument === undefined || documentData === undefined) {
        continue;
      }
      const declarationOrDefinitionTokenData = documentData.tokens[declarationOrDeclarationToken.idx];
      tokenLocationLinks.push({
        uri: uri,
        range: this.documentManager.getTokenRange(textDocument, declarationOrDefinitionTokenData)
      });
    }
    declarationsOrDefinitions.set(i, tokenLocationLinks);
  }
  private addSemanticToken(i: number, tokenStr: string, identifiers: Map<string, IdentifierInfo>, semanticTokens: Map<number, SemanticToken>, ) {
    const identifierInfo = identifiers.get(tokenStr);
    if (identifierInfo?.tokenType !== undefined) {
      const semanticToken: SemanticToken = {
        tokenType: identifierInfo.tokenType,
        tokenModifiers: undefined // todo ?
      };
      semanticTokens.set(i, semanticToken);
    }
  }
  private addSignatureHelp(i: number, tokenStr: string, identifiers: Map<string, IdentifierInfo>, signatureHelps: Map<number, SigHelp>, ) {
    const identifierInfo = identifiers.get(tokenStr);
    if (identifierInfo?.signatureHelp === undefined) {
      return;
    }
    signatureHelps.set(i, identifierInfo.signatureHelp);
  }

  getTokenStr(textDocument: TextDocument, tokenIdx: number) {
    const documentData = this.documentManager.documentData.get(textDocument.uri);
    if (documentData) {
      const tokenData = documentData.tokens[tokenIdx];
      if (tokenData !== undefined) {
        return textDocument.getText().substring(tokenData[0], tokenData[0] + tokenData[1]);
      }
    }
  }
}
