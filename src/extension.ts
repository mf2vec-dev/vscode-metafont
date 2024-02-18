import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { activateMfCommands } from './base/mfCommands';
import { activateMfFileManager, MfFileManager } from './base/mfFileManager';
import { activateMfFilesView } from './base/mfFilesTreeView';
import { activateProjectFileManager } from './base/projectFileManager';
import { MetafontDebugSession } from './debug/metafontDebugSession';
import { activateLanguageFeatures } from './language/languageFeatures';
import {
  DebugExpressionPreviewWebviewViewManager
} from './webviews/debugExpressionPreviewWebviewManager';
import {
  FontPreviewWebviewPanelManager, FontPreviewWebviewViewManager
} from './webviews/fontPreviewWebviewManager';
import {
  GlyphOverviewWebviewPanelManager, GlyphOverviewWebviewViewManager
} from './webviews/glyphOverviewWebviewManager';
import {
  GlyphPreviewWebviewPanelManager, GlyphPreviewWebviewViewManager
} from './webviews/glyphPreviewWebviewManager';
import { GlyphTableWebviewViewManager } from './webviews/glyphTableWebviewManager';
import { KerningTableWebviewViewManager } from './webviews/kerningTableWebviewManager';
import { LigatureTableWebviewViewManager } from './webviews/ligatureTableWebviewManager';
import { refreshAllFileWebviews } from './webviews/webviewInteractionMixins';

export let activeMfFileAbsPath: string | undefined = undefined;
export let activeMfFileLineNumber: number | undefined = undefined;

export let debugAdapterFactory: InlineDebugAdapterFactory;
export let debugExpressionPreviewWebviewViewManager: DebugExpressionPreviewWebviewViewManager;

export async function activate(ctx: vscode.ExtensionContext) {
  const languageClient = activateLanguageFeatures(ctx);
  activateActiveFileWatchers(ctx);

  const projectFileManager = activateProjectFileManager(ctx);
  const mfFileManager = await activateMfFileManager(ctx, projectFileManager);
  projectFileManager.mfFileManager = mfFileManager;
  activateMfCommands(ctx, mfFileManager);

  // views
  activateActivityBarViews(ctx, mfFileManager, languageClient);
  activatePanelViews(ctx, mfFileManager);

  // webview panels
  ctx.subscriptions.push(
    vscode.commands.registerCommand('vscode-metafont.new-glyph-preview-panel', () => new GlyphPreviewWebviewPanelManager(ctx, mfFileManager))
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand('vscode-metafont.new-font-preview-panel', () => new FontPreviewWebviewPanelManager(ctx, mfFileManager))
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand('vscode-metafont.new-glyph-overview-panel', () => new GlyphOverviewWebviewPanelManager(ctx, mfFileManager))
  );
  ctx.subscriptions.push(
    vscode.commands.registerCommand('vscode-metafont.refresh-all-file-webviews', refreshAllFileWebviews)
  );

  activateDebug(ctx);
}

function activateActiveFileWatchers(ctx: vscode.ExtensionContext) {
  function setActiveMfFile(textEditor?: vscode.TextEditor) {
    if (textEditor && textEditor.document.languageId === 'metafont') {
      activeMfFileAbsPath = textEditor.document.fileName;
      activeMfFileLineNumber = textEditor.selections[0].active.line + 1; // +1 for one-based line numbering
    }
  }
  const activeTextEditor = vscode.window.activeTextEditor;
  setActiveMfFile(activeTextEditor);

  vscode.window.onDidChangeTextEditorSelection(
    (textEditorSelectionChangeEvent) => setActiveMfFile(textEditorSelectionChangeEvent.textEditor),
    undefined,
    ctx.subscriptions
  );

  vscode.window.onDidChangeActiveTextEditor(
    setActiveMfFile,
    undefined,
    ctx.subscriptions
  );
}

async function activateActivityBarViews(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager, languageClient: LanguageClient) {
  activateMfFilesView(ctx, mfFileManager, languageClient);
  new GlyphTableWebviewViewManager(ctx, mfFileManager);
  new KerningTableWebviewViewManager(ctx, mfFileManager);
  new LigatureTableWebviewViewManager(ctx, mfFileManager);
  new GlyphPreviewWebviewViewManager(ctx, mfFileManager);
  new GlyphOverviewWebviewViewManager(ctx, mfFileManager);
}

async function activatePanelViews(ctx: vscode.ExtensionContext, mfFileManager: MfFileManager) {
  new FontPreviewWebviewViewManager(ctx, mfFileManager);
}

async function activateDebug(ctx: vscode.ExtensionContext) {
  debugAdapterFactory = new InlineDebugAdapterFactory();
  ctx.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('metafont', debugAdapterFactory)
  );
  debugExpressionPreviewWebviewViewManager = new DebugExpressionPreviewWebviewViewManager(ctx);
}

class InlineDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  debugSessions: {[sessionId: vscode.DebugSession['id']]: MetafontDebugSession} = {};
  createDebugAdapterDescriptor(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    const metafontDebugSession = new MetafontDebugSession();
    this.debugSessions[session.id] = metafontDebugSession;
    return new vscode.DebugAdapterInlineImplementation(metafontDebugSession);
  }
}
