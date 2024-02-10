import { DebugProtocol } from '@vscode/debugprotocol';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'node:stream';
import * as path from 'path';
import * as vscode from 'vscode';
import * as types from '../base/types';


export class MetafontDebugWrapper extends EventEmitter {
  mfProcess?: childProcess.ChildProcessByStdio<Writable, Readable, null>;
  inputFiles: { [uri: string]: { lines: string[] } } = {};
  breakpoints: { [uri: string]: DebugProtocol.Breakpoint[] } = {};
  lastSetBreakpointId = 0;
  threadId = 1; // 0 doesn't work
  paused = false;
  clientLineOffset = 1; // client default is linesStartAt1 === true, but this debuggerLinesStartAt1 === false
  clientColumnOffset = 1; // see above
  processTokensPromise = Promise.resolve();
  tokenProcessingQueue: {tokens: string, internal: boolean, resolve: (value: types.TokenProcessingResult | undefined) => void, reject: (reason?: any) => void}[] = [];
  isProcessingTokens = false;
  stack: { filePath: string; lineNumber: number }[] = [];
  pausedOnException = false;
  variableNames: string[] = [
    // initial internal quantities
    'autorounding',
    'boundarychar',
    'charcode',
    'chardp',
    'chardx',
    'chardy',
    'charext',
    'charht',
    'charic',
    'charwd',
    'day',
    'designsize',
    'fillin',
    'fontmaking',
    'granularity',
    'hppp',
    'month',
    'pausing',
    'proofing',
    'showstopping',
    'smoothing',
    'time',
    'tracingcapsules',
    'tracingchoices',
    'tracingcommands',
    'tracingedges',
    'tracingequations',
    'tracingmacros',
    'tracingonline',
    'tracingoutput',
    'tracingpens',
    'tracingrestores',
    'tracingspecs',
    'tracingstats',
    'tracingtitles',
    'turningcheck',
    'vppp',
    'warningcheck',
    'xoffset',
    'year',
    'yoffset'
  ];

  public async start(inputFilePath: string): Promise<void> {
    await this.readFile(inputFilePath);
    this.stack.push({
      filePath: inputFilePath,
      lineNumber: 0
    });

    this.mfProcess = childProcess.spawn(
      'mf', [
        '\\'
        + 'scrollmode;'
        + 'def __mfIIvec__hide__(text t)=exitif numeric begingroup t;endgroup;enddef;'
        + 'let __mfIIvec__comma__=,;'
        + [ 'save', 'newinternal' ].map((command) =>
          `let __mfIIvec__${command}__=${command};`
          + `def ${command} text t=__mfIIvec__hide__(message"@mf2vec@${command}";`
            + 'showtoken t;' // use showtoken instead of show since it also processes <symbolic token list> (no workaround for commas, no problem with sparks)
          + `message"@mf2vec@")__mfIIvec__${command}__ t enddef;`
        ).join('')
        // + [ 'boolean', 'string', 'path', 'pen', 'picture', 'transform', 'pair', 'numeric' ].map((type) => 
        //   `let __mfIIvec__${type}__=${type};`
        //   + `def ${type} suffix s=__mfIIvec__hide__(message"@mf2vec@${type}";`
        //     + 'show str s;' // todo only first in declaration list
        //   + `message"@mf2vec@")__mfIIvec__${type}__ s enddef;`
        // ).join('')
        + 'tracingequations:=1;' // show new and changed variables
        // + 'tracingcapsules:=1;'
        // + 'tracingcommands:=1;'
        + 'tracingrestores:=1;' // show variables that are available again (if they were saved but not declared/assigned)
        // + 'tracingmacros:=1;'
        + 'tracingonline:=1;' // show paths and tracing
        + 'let __mfIIvec__input__=input;'
        + 'def input='
          + 'message"@mf2vec@input";'
          + 'scantokens("message"&char34&"@mf2vec@"&char34&";endinput")' // endinput will be read before tokens from the input file
          + '__mfIIvec__input__ ' // this will only read the first line
        + 'enddef;'
      ], {
        cwd: vscode.workspace.workspaceFolders?.at(0)?.uri.fsPath, // select other than 0 for multiple workspaces
        stdio: ['pipe', 'pipe', 'ignore'] // metafont doesn't use stderr
      }
    );
    this.mfProcess.on('close', ()=>{
      this.sendEvent('end');
    });
    if (this.mfProcess) {
      // wait until mf is started and waits for input
      const awaitMetafontStartupAndStartDebugging = async (data: Buffer) => {
        const s = data.toString();
        if (s.endsWith('\n*') && this.mfProcess) {
          this.mfProcess.stdout.off('data', awaitMetafontStartupAndStartDebugging);
          await this.continue(false);
        }
      };
      this.mfProcess.stdout.on('data', awaitMetafontStartupAndStartDebugging);
    }
  }
  private async readFile(inputFilePath: string) {
    const inputFileUri = vscode.Uri.file(inputFilePath);
    const fileByteArray = await vscode.workspace.fs.readFile(inputFileUri);
    const fileContent = Buffer.from(fileByteArray).toString('utf8'); // todo encoding from vscode for this file
    const lines = fileContent.split(/\r?\n/);
    this.inputFiles[inputFilePath] = {
      lines: lines
    };
  }

  private sendEvent(event: string, ...args: any[]) {
    this.emit(event, ...args);
  }

  public async continue(afterStop: boolean = true, stopCallback: () => boolean = () => false) {
    if (this.pausedOnException) {
      // make sure to advance one line if there was an exception before
      // if called by step, line was advanced and pausedOnException was reset
      this.advanceCurrentLine();
      this.pausedOnException = false;
    }
    this.paused = false;
    while (!this.paused && !stopCallback()) {
      const stopped = await this.processLine(afterStop);
      if (stopped) {
        return;
      }
      afterStop = false;
    }
    if (this.paused) {
      // while loop ended due to pause
      this.sendEvent('stoppedOnPause');
    }
    // otherwise while loop ended due to stopCallback
    // event may be emitted by stopCallback
  }
  /**
   * advance and stop after a step
   */
  async next() {
    await this.step();
    this.sendEvent('stoppedOnStep');
  }
  async stepIn() {
    await this.step(1);
    this.sendEvent('stoppedOnStep');
  }
  async stepOut() {
    await this.step(-1);
    this.sendEvent('stoppedOnStep');
  }
  /**
   * step one line in the current file
   * if there is a input on this line process it (but stop on breakpoints in that file etc.)
   * @param [stepDirection] 0 to step, 1 to step in, -1 to step out
   */
  async step(stepDirection: number = 0) {
    if (this.pausedOnException) {
      // advance one line if there was an exception before
      this.advanceCurrentLine();
      this.pausedOnException = false;
      return; // this was a step out of the erroneous line
    }
    const stepStackLength = this.stack.length;
    let firstLine = true;
    await this.continue(true, () => {
      let pauseNow: boolean;
      if (stepDirection > 0) { // stepping in
        // Pause on the next line, whichever file it is from.
        // This causes stepIn to step to next line (or out) if it cannot step in.
        pauseNow = !firstLine;
      } else { // step or step out
        // Only pause if the desired stack length is met.
        // <= to catch multiple step out (probably never happens)
        pauseNow = !firstLine && this.stack.length <= stepStackLength + stepDirection;
      }
      firstLine = false;
      return pauseNow;
    });
  }
  /**
   * process the current line if there is no breakpoint and advance to the next line
   */
  async processLine(afterStop: boolean = true): Promise<boolean> {
    if (!afterStop) { // only check for breakpoints if not stopped just before executing this line
      const stoppedAtBreakpoint = this.checkForBreakpoints();
      if (stoppedAtBreakpoint) {
        return true;
      }
    }
    const couldNotExecute = await this.executeCurrentLine();
    if (couldNotExecute) {
      return true;
    }
    const couldNotAdvance = this.advanceCurrentLine();
    if (couldNotAdvance) {
      return true;
    }
    return false;
  }
  advanceCurrentLine() {
    const currentStackFrame = this.stack.at(-1);
    if (currentStackFrame) {
      const currentinputFile = this.inputFiles[currentStackFrame.filePath];
      const currentLine = currentStackFrame.lineNumber;
      if (currentLine < currentinputFile.lines.length-1) {
        currentStackFrame.lineNumber++;
      } else {
        // no more lines
        const parent = this.stack.at(-2);
        if (parent) {
          this.stack.pop(); // switch to parent stack frame
          return this.advanceCurrentLine();
        }
        // no parent
        this.sendEvent('end');
        return true; // reached end, could not advance
      }
      return false;
    }
    return true; // no current stack, could not advance
  }
  
  checkForBreakpoints() {
    const currentStackFrame = this.stack.at(-1);
    if (currentStackFrame) {
      const currentLine = currentStackFrame.lineNumber;

      const breakpoints = this.breakpoints[currentStackFrame.filePath];
      if (breakpoints) {
        const currentLineBreakpoints = breakpoints.filter((bp) => bp.line && bp.line-1 === currentLine);
        if (currentLineBreakpoints.length > 0) {
          this.sendEvent('stoppedOnBreakpoint');
          for (const breakpoint of currentLineBreakpoints) {
            if (!breakpoint.verified) {
              breakpoint.verified = true;
              this.sendEvent('breakpointValidated', breakpoint);
            }
          }
          return true;
        }
      }
    }
    return false;
  }
  /**
   * @returns true if execution failed
   */
  public async executeCurrentLine(): Promise<boolean> {
    if (this.mfProcess) {
      const currentLine = this.getCurrentLine();
      if (currentLine !== undefined) {
        const result = await this.processTokens(currentLine);
        if (result) {
          if (result.input) {
            const workspaceDirs = vscode.workspace.workspaceFolders;
            if (workspaceDirs && workspaceDirs[0]) {
              const inputFilePath = path.resolve(workspaceDirs[0].uri.fsPath, result.input.inputPath);
              await this.readFile(inputFilePath);
              this.stack.push({
                filePath: inputFilePath,
                lineNumber: 0
              });
            } else {
              return true; // no workspace as base path
            }
          }
          if (result.exception) {
            this.pausedOnException = true;
            return true; // exception
          }
          return false;
        }
      }
    }
    return true; // no process
  }
  async enqueueTokenProcessing(tokens: string, internal: boolean = true): Promise<types.TokenProcessingResult | undefined> {
    return new Promise<types.TokenProcessingResult | undefined>((resolve, reject) => {
      this.tokenProcessingQueue.push({ tokens, internal, resolve, reject });
      if (!this.isProcessingTokens) {
        this.processTokenQueue();
      }
    });
  }
  async processTokenQueue() {
    if (this.tokenProcessingQueue.length === 0) {
      this.isProcessingTokens = false;
      return;
    }

    // queue not empty
    this.isProcessingTokens = true;
    const queueItem = this.tokenProcessingQueue.shift();
    if (!queueItem) { // handle undefined
      return;
    }
    const { tokens, internal, resolve, reject } = queueItem;
    try {
      resolve(await this.processTokens(tokens, internal));
    } catch (error) {
      reject(error);
    }
    this.processTokenQueue();
  }

  /**
   * process METAFONT tokens in the wrappers METAFONT process
   * @param tokens the tokens to process
   * @param internal if true no output is send to the console
   * @returns the token processing result
   */
  async processTokens(tokens: string, internal: boolean = false): Promise<types.TokenProcessingResult | undefined> {
    if (this.mfProcess) {
      // todo check if empty or only comment and skip
      const mfResponsePromise = new Promise<string>((resolve, reject) => {
        if (this.mfProcess) {
          this.mfProcess.stdout.once('data', (data: Buffer) => {
            if ([4096, 8192].includes(data.length)) {
              vscode.window.showWarningMessage('METAFONT\'s response has a suspicious length and may have been truncated. This is might be a bug in child_process. Try again or restart debugging.');
              // doesn't help: (this.mfProcess.stdout as any)._handle.setBlocking(true);
            }
            resolve(data.toString());
          });
        } else {
          reject();
        }
      });
      this.mfProcess.stdin.write(tokens + '\n');
      const mfResponse = await mfResponsePromise;

      let tokenProcessingResult: types.TokenProcessingResult = {
        rawResponse: mfResponse,
        cleanResponse: mfResponse
      };

      // error message start with ! and end with the line after the line beginning with <*>
      const resultErrorMatch = tokenProcessingResult.cleanResponse.match(/^(.*)((! .*?)\n.*?(<\*>.*?\n.*?))\n(.*)$/ms);
      // [ everything, beforeError, errorFull, errorFirstLine, last2ErrorLines, afterError ]
      if (resultErrorMatch) {
        this.sendEvent('stoppedOnException', resultErrorMatch[2]);
        tokenProcessingResult.cleanResponse = resultErrorMatch[1] + resultErrorMatch[5];
        tokenProcessingResult.exception = true;
      }

      let traces: types.Trace[] = [];
      let inputMatch = tokenProcessingResult.cleanResponse.match(/^(.*?)@mf2vec@input \(([^\n]+?)(?:\n@mf2vec@\n?([^()]*?(?:\([^()]*\)[^()]*?)*)\)|\)\n@mf2vec@)(.*?)\n\*$/s); // ) is before @mf2vec@ if file is empty
      // inputMatch: [everything, inLineBeforeInput, inputPath, firstLineInFile, inLineAfterInput]
      if (inputMatch) {
        tokenProcessingResult.input = {
          inputPath: inputMatch[2]
        };
        if (inputMatch[4] && inputMatch[4].length > 0) {
          vscode.window.showWarningMessage(`There were tokens after an input statement on the same line. They were processed after the first line of the input file. This debugger doesn\'t support tokens after an input statement on the same line.`);
        }
        if (inputMatch[3] === undefined) {
          // empty file
          tokenProcessingResult.cleanResponse = inputMatch[1] + '(' + inputMatch[2] + ')' + inputMatch[4];
        } else {
          tokenProcessingResult.cleanResponse = inputMatch[1] + '(' + inputMatch[2] + inputMatch[3]  + inputMatch[4];
          // file will be closed later
        }
      }
      const tracePattern = /(?:#{2,4} (.+?)|\{restoring (.+?)\}|@mf2vec@((?:save|newinternal)\n> .*)\n@mf2vec@)\n/gs;
      const replaceTraces = (_traceMatch: string, equationTrace: string | undefined, restoreTrace: string | undefined, saveOrNewinternalTrace: string | undefined) => {
        let matchTraces: types.Trace[] = [];
        if (equationTrace) {
          matchTraces.push({
            type: 'equation',
            trace: equationTrace
          });
        } else if (restoreTrace) {
          matchTraces.push({
            type: 'restore',
            trace: restoreTrace,
          });
        } else if (saveOrNewinternalTrace){
          let saveOrNewinternalTraceStrings = saveOrNewinternalTrace.split('\n> ');
          let saveOrNewinternal = saveOrNewinternalTraceStrings[0];
          saveOrNewinternalTraceStrings = saveOrNewinternalTraceStrings.slice(1);
          // saveOrNewinternalTraceStrings = saveOrNewinternalTraceStrings.map((variable) => variable.slice(1, variable.length-1)); // remove ""
          saveOrNewinternalTraceStrings = saveOrNewinternalTraceStrings.map((variable) => {
            // After showtoken's = can only follow a primitive, 'tag' or 'macro...'.
            if (variable.split('=').length === 2) { // 1 =
              return variable.split('=')[0];
            } else { // multiple =
              // this is difficult:
              // *let |=| = :; let | = |=:; showtoken |=|,|;
              // > |=|=:
              // > |=|=:
              return ''; // ignore
            }
          });
          let saveOrNewinternalTraces = saveOrNewinternalTraceStrings.filter((saveOrNewinternalTrace) => saveOrNewinternalTrace !== undefined).map((saveOrNewinternalTrace) => {
            return {
              type: saveOrNewinternal,
              trace: saveOrNewinternalTrace
            };
          });
          matchTraces.push(...saveOrNewinternalTraces);
        }
        traces.push(...matchTraces);
        return ''; // remove matched character range
      };

      tokenProcessingResult.cleanResponse = tokenProcessingResult.cleanResponse.replace(tracePattern, replaceTraces);
      this.processTraces(traces);

      const asteriskMatch = tokenProcessingResult.cleanResponse.match(/^.*?(\(Please type a command or say `end'\))?\n\*$/ms);
      if (asteriskMatch) {
        if (asteriskMatch[1]) {
          // remove '(Please type a command or say `end')\n*'
          tokenProcessingResult.cleanResponse = tokenProcessingResult.cleanResponse.slice(0, -38);
        } else {
          // remove '*'
          tokenProcessingResult.cleanResponse = tokenProcessingResult.cleanResponse.slice(0, -1);
        }
      }

      if (!internal) {
        this.sendEvent('output', tokenProcessingResult.cleanResponse);
        tokenProcessingResult.cleanResponse = '';
      }
      return tokenProcessingResult;
    }
  }

  processTraces(traces: types.Trace[]) {
    for (const trace of traces) {
      switch (trace.type) {
      case 'equation':
        // Also match %CAPSULEnnnn. Otherwise CAPSULEnnnn would be added as a variable and METAFONT would try to evaluate it, with nnnn possibly exceeding METAFONT's infinity.
        let varMatches = trace.trace.matchAll(/(?:[xy][xy]?part )?(?:%CAPSULE\d+|([A-Z_a-z`'!?#&@$](?:[A-Z_a-z`'!?#&@$\.\d ])*)(?<!\.))/g);
        let vars = [...varMatches].map((match) => match[1]); // index 1 for match group, i.e. var name without xypart
        vars = vars.filter((v) => v !== undefined); // undefined is %CAPSULEnnnn
        if (vars) {
          this.variableNames = [...new Set([...this.variableNames, ...vars])].sort();
        }
        break;
      case 'restore':
        let restoredVar = trace.trace.match(/(.+?)(?:=.*)?/);
        if (restoredVar) {
          this.variableNames = [...new Set([...this.variableNames, restoredVar[1]])].sort();
        }
        break;
      case 'save':
        this.variableNames = this.variableNames.filter((v) => v !== trace.trace);
        break;
      case 'newinternal':
        this.variableNames = [...new Set([...this.variableNames, trace.trace])].sort();
        break;
      }
    }
  }

  async waitForMf() {
    if (this.mfProcess) {
      for await (const data of this.mfProcess.stdout) {
        return data.toString();
      }
    }
  }

  private getCurrentLine(): string | undefined {
    const currentStackFrame = this.stack.at(-1);
    if (currentStackFrame) {
      const currentFileLines = this.inputFiles[currentStackFrame.filePath].lines;
      return currentFileLines[currentStackFrame.lineNumber].trim();
    }
  }

  clearFileBreakpoints(filePath: string) {
    this.breakpoints[filePath] = [];
  }

  async setBreakpoint(filePath: string, line: number): Promise<DebugProtocol.Breakpoint> {
    if (!this.inputFiles[filePath]) {
      // unknown file: add it to be able to add breakpoints for it
      await this.readFile(filePath);
    }
    const valid = 0 <= line && line < this.inputFiles[filePath].lines.length;
    const clientLine = line + this.clientLineOffset;
    const breakpoint: DebugProtocol.Breakpoint = { id: this.lastSetBreakpointId++, verified: valid, line: clientLine, column: this.clientColumnOffset };
    if (valid) {
      this.sendEvent('breakpointValidated', breakpoint);
    }
    this.breakpoints[filePath].push(breakpoint);
    return breakpoint;
  }

  pause() {
    this.paused = true;
  }

  async evaluateExpression(expression: string): Promise<types.ExpressionResult> {
    const showStatement = `show ${expression}`;
    const hiddenShowStatement = `__mfIIvec__hide__(${showStatement})`;
    const mfProcessResult = await this.enqueueTokenProcessing(hiddenShowStatement);
    if (mfProcessResult) {
      const mfOutput = mfProcessResult?.cleanResponse;
      const resultMatch = mfOutput.match(/^>> (.*)\n$/s);
      let exprType: string | undefined;
      if (resultMatch) {
        let content = resultMatch[1];
        const lineMatch = content.match(/(Path|Edge structure) at line \d+:\n(.*)\n?\n/s);
        if (lineMatch) {
          content = lineMatch[2];
          if (lineMatch[1] === 'Path') {
            exprType = 'path';
            content = content.replace(/\n+ ?/g, '');
          } else {
            exprType = 'picture';
            if (content.length === 0) {
              content = '<empty>';
            }
          }
        }
        return {
          kind: 'value',
          type: exprType,
          content: content
        };
      }
    }
    return {
      kind: 'raw',
      content: ''
    };
  }

  async setVariable(name: string, value: string, useAssignment: boolean = true) {
    // check value
    const valueWithoutStr = value.replace(/".*?"/g, '');
    if (valueWithoutStr.match(/\(/g)?.length !== valueWithoutStr.match(/\)/g)?.length) {
      // unbalanced delimiters which will cause problems with hide below
      vscode.window.showErrorMessage('value has unbalanced parenthesis');
      return;
    }
    if (/\([^,]+(?:,[^,]+){5}\)/.test(value)) {
      // Transforms cannot be set directly using name := (a,b,c,d,e,f); and xpart name etc. is not a variable so only equation works.
      // reset variable first
      const hiddenDeclarationStatement = `__mfIIvec__hide__(transform ${name})`;
      await this.enqueueTokenProcessing(hiddenDeclarationStatement);
      // now the variables is unset and equations can be used for the parts
      value = value.slice(1, value.length-1); // remove ()
      const partValues = value.split(',');
      const partList: [string, string][] = [
        ['xpart ' + name, partValues[0]],
        ['ypart ' + name, partValues[1]],
        ['xxpart ' + name, partValues[2]],
        ['xypart ' + name, partValues[3]],
        ['yxpart ' + name, partValues[4]],
        ['yypart ' + name, partValues[5]]
      ];
      for (const [partName, partValue] of partList) {
        this.setVariable(partName, partValue, false); // don't use assignment since parts are not a variable
      }
      return;
    }
    if (/^\s*[xy][xy]?part/.test(name) && useAssignment) {
      vscode.window.showWarningMessage('Setting parts of pairs or transforms is not supported. Change the value of the variable.');
      return;
    }
    let is: string;
    if (useAssignment) {
      is = ':=';
    } else {
      is = '=';
    }
    const hiddenSetStatement = `__mfIIvec__hide__(${name} ${is} ${value})`; // spaces since name and value could be of character group <=>:|
    await this.enqueueTokenProcessing(hiddenSetStatement);
    // todo check for errors
  }
}