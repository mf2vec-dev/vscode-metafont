import * as DebugAdapter from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { Subject } from 'await-notify';
import * as path from 'path';
import * as vscode from 'vscode';
import { debugExpressionPreviewWebviewViewManager } from '../extension';
import { MetafontDebugWrapper } from './metafontDebugWrapper';


interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  inputFile: string;
}

export class MetafontDebugSession extends DebugAdapter.LoggingDebugSession {
  configurationDone = new Subject();
  mfDebugWrapper: MetafontDebugWrapper;
  clientLinesStartAt1 = true;
  clientColumnsStartAt1 = true;
  clientLineOffset = 1; // client default is linesStartAt1 === true, but this debuggerLinesStartAt1 === false
  clientColumnOffset = 1; // see above
  maxScopeRef = 0;

  constructor() {
    super();

    this.setDebuggerLinesStartAt1(false);
    this.setDebuggerColumnsStartAt1(false);

    this.mfDebugWrapper = new MetafontDebugWrapper();
    this.mfDebugWrapper.on('output', (output) => {
      this.sendEvent(new DebugAdapter.OutputEvent(output, 'stdout'));
    });
    this.mfDebugWrapper.on('stoppedOnPause', () => {
      this.sendEvent(new DebugAdapter.StoppedEvent('pause', this.mfDebugWrapper.threadId));
      this.updateExpressionPreview();
    });
    this.mfDebugWrapper.on('stoppedOnStep', () => {
      this.sendEvent(new DebugAdapter.StoppedEvent('step', this.mfDebugWrapper.threadId));
      this.updateExpressionPreview();
    });
    this.mfDebugWrapper.on('stoppedOnBreakpoint', () => {
      this.sendEvent(new DebugAdapter.StoppedEvent('breakpoint', this.mfDebugWrapper.threadId));
      this.updateExpressionPreview();
    });
    this.mfDebugWrapper.on('stoppedOnException', (exceptionTest: string | undefined) => {
      this.sendEvent(new DebugAdapter.StoppedEvent('exception', this.mfDebugWrapper.threadId, exceptionTest));
    });
    this.mfDebugWrapper.on('end', () => {
      this.sendEvent(new DebugAdapter.TerminatedEvent());
    });
  }

  updateExpressionPreview() {
    debugExpressionPreviewWebviewViewManager.refreshWebview();
  }

  initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments) {
    vscode.window.showWarningMessage('The development of METAFONT Debugger is not yet finished and it does not work yet.');
    if (args.locale && args.locale !== 'en') {
      vscode.window.showWarningMessage('Currently, only the locale \'en\' is supported.');
    }
    if (args.linesStartAt1) {
      this.clientLineOffset = args.linesStartAt1 ? 1 : 0;
    }
    this.mfDebugWrapper.clientLineOffset = this.clientLineOffset;
    if (args.columnsStartAt1) {
      this.clientColumnOffset = args.columnsStartAt1 ? 1 : 0;
    }
    this.mfDebugWrapper.clientColumnOffset = this.clientColumnOffset;
    // todo: analyze args

    response.body = response.body || {};
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsEvaluateForHovers = true;
    response.body.supportsSetVariable = true;
    // response.body.supportsBreakpointLocationsRequest = true;
    // response.body.supportsDataBreakpoints = true;
    // response.body.supportsFunctionBreakpoints = true;
    // response.body.supportsConditionalBreakpoints = true;
    // response.body.supportsInstructionBreakpoints = true;
    // response.body.supportsHitConditionalBreakpoints = true;
    // response.body.supportsLogPoints = true;

    this.sendResponse(response);
    this.sendEvent(new DebugAdapter.InitializedEvent());
  }

  // configuration requests

  async setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments) {
    response.body = {
      breakpoints: []
    };
    if (args.source.path && args.breakpoints) {
      const filePath = args.source.path;
      this.mfDebugWrapper.clearFileBreakpoints(filePath);
      for (const breakpoint of args.breakpoints) {
        const breakpointClientLine = breakpoint.line;
        const breakpointLine = breakpointClientLine - this.clientLineOffset;
        // todo: condition, hitCondition, logMessage
        const clientBreakpoint = await this.mfDebugWrapper.setBreakpoint(filePath, breakpointLine);
        response.body.breakpoints.push(clientBreakpoint);
      }
    }
    this.sendResponse(response);
  }

  configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments) {
    super.configurationDoneRequest(response, args);
    this.configurationDone.notify();
  }

  // control/action requests

  async launchRequest(response: DebugProtocol.LaunchResponse, args: ILaunchRequestArguments) {
    await this.configurationDone.wait(1000);
    this.mfDebugWrapper.start(args.inputFile);
    this.sendResponse(response);
  }
  pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments) {
    this.mfDebugWrapper.pause();
    this.sendResponse(response);
  }
  continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments) {
    this.mfDebugWrapper.continue();
    this.sendResponse(response);
  }
  async nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments) {
    await this.mfDebugWrapper.next();
    this.sendResponse(response);
  }
  async stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments) {
    await this.mfDebugWrapper.stepIn();
    this.sendResponse(response);
  }
  async stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments) {
    await this.mfDebugWrapper.stepOut();
    this.sendResponse(response);
  }
  // disconnect ?


  // stopped event requests

  threadsRequest(response: DebugProtocol.ThreadsResponse) {
    response.body = {
      threads: [
        // only one thread
        new DebugAdapter.Thread(this.mfDebugWrapper.threadId, 'Main Tread')
      ]
    };
    this.sendResponse(response);
  }

  stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments) {
    let stackFrames: DebugProtocol.StackFrame[] = [];
    if (args.threadId === 1) { // there is only thread 1 with content
      if (!args.startFrame || args.startFrame === 0) {
        stackFrames = [];
        for (let i = this.mfDebugWrapper.stack.length-1; i >= 0; i--) {
          const stackFrame = this.mfDebugWrapper.stack[i];
          let stackFrameName: string;  // todo improve
          if (i === 0) {
            stackFrameName = '<job_file>';
          } else {
            stackFrameName = '<input_file>';
          }
          stackFrames.push(
            new DebugAdapter.StackFrame(
              i,
              stackFrameName,
              this.createSource(stackFrame.filePath),
              stackFrame.lineNumber + this.clientLineOffset
            )
          );
        }
        // }
      }
    }
    response.body = {
      stackFrames: stackFrames,
      // todo totalFrames
    };
    this.sendResponse(response);
  }

  scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments) {
    response.body = {
      scopes: [
        new DebugAdapter.Scope('Global', 1, false)
        // todo get scopes created by save in groups
      ]
    };
    this.maxScopeRef = response.body.scopes.length;
    this.sendResponse(response);
  }

  async variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments) {
    let variables: DebugProtocol.Variable[] = [];
    if (args.variablesReference <= this.maxScopeRef) {
      for (const [i, varName] of this.mfDebugWrapper.variableNames.entries()) {
        const varRef = i + this.maxScopeRef+1;
        const varValue = await this.evaluateExpression(varName);
        let ref: number | undefined = undefined;
        let indexedVarialbese: number | undefined = undefined;
        let namedVariables: number | undefined = undefined;
        if (/\([^,]+,[^,]+\)/.test(varValue)) {
          // pair
          ref = varRef;
          indexedVarialbese = 0;
          namedVariables = 2;
        } else if (/\([^,]+(?:,[^,]+){5}\)/.test(varValue)) {
          // transform
          ref = varRef;
          indexedVarialbese = 0;
          namedVariables = 6;
        }
        let variable: DebugProtocol.Variable = new DebugAdapter.Variable(varName, varValue, ref, indexedVarialbese, namedVariables);
        variables.push(variable);
      }
    } else {
      // pair or transform
      const i = args.variablesReference - (this.maxScopeRef+1);
      const varName = this.mfDebugWrapper.variableNames[i];
      const varValue = await this.evaluateExpression(varName);
      if (/\([^,]+,[^,]+\)/.test(varValue) || /\([^,]+(?:,[^,]+){5}\)/.test(varValue)) {
        let valuesStr = varValue.slice(1, varValue.length-1); // remove ()
        let values = valuesStr.split(',');
        let partNames = [ 'xpart', 'ypart' ];
        if (values.length === 6) {
          partNames.push('xxpart', 'xypart', 'yxpart', 'yypart');
        }
        for (let i = 0; i < values.length; i++) {
          variables.push(new DebugAdapter.Variable(partNames[i] + ' ' + varName, values[i]));
        }
      }
    }
    response.body = {
      variables: variables
    };
    this.sendResponse(response);
  }

  /**
   * used for watch, hover
   */
  async evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments) {
    if (args.context === 'hover') {
      
    }
    let value = await this.evaluateExpression(args.expression);
    if (value === undefined) {
      response.body = {
        result: 'could not evaluate',
        variablesReference: 0,
        presentationHint: { kind: 'event' }
      };
    } else {
      response.body = {
        result: value,
        variablesReference: 0,
        presentationHint: { kind: 'data' }
      };
    }
    this.sendResponse(response);
  }

  async evaluateExpression(expression: string): Promise<string> {
    const mfResult = await this.mfDebugWrapper.evaluateExpression(expression);
    return mfResult.content;
  }

  async setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments) {
    await this.mfDebugWrapper.setVariable(args.name, args.value);
    response.body = {
      value: await this.evaluateExpression(args.name)
    };
    this.sendResponse(response);
  }

  // helpers

  createSource(filePath?: string) {
    if (!filePath) {
      return new DebugAdapter.Source('unknown input file');
    }
    return new DebugAdapter.Source(path.basename(filePath), this.convertDebuggerPathToClient(filePath));
  }
}
