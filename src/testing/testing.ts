import * as childProcess from 'child_process';
import path = require('node:path');
import * as vscode from 'vscode';

type TestData = {
  workspaceUri: vscode.Uri;
};

export const testData = new WeakMap<vscode.TestItem, TestData>();

export async function activateTesting(context: vscode.ExtensionContext) {
  const testController = initTestDiscovering(context);
  initTestRunning(testController);
}

function initTestDiscovering(context: vscode.ExtensionContext) {
  const testController = vscode.tests.createTestController('metafontTestController', 'METAFONT Testing');
  context.subscriptions.push(testController);

  testController.resolveHandler = async (testItem: vscode.TestItem | undefined) => {
    if (testItem === undefined) {
      await discoverAllTestFilesInWorkspaces();
    }
    // no children of test items
  };
  testController.refreshHandler = async () => {await discoverAllTestFilesInWorkspaces();};

  async function discoverAllTestFilesInWorkspaces() {
    if (!vscode.workspace.workspaceFolders) {
      return []; // no tests if no workspace folder
    }

    return Promise.all(
      vscode.workspace.workspaceFolders.map(async (workspaceFolder) => {
        const pattern = new vscode.RelativePattern(workspaceFolder, '**/test_*.mf');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);

        watcher.onDidCreate((uri) => getOrCreateFileTestItem(uri, workspaceFolder));
        watcher.onDidDelete((uri) => testController.items.delete(uri.toString()));

        for (const file of await vscode.workspace.findFiles(pattern)) {
          getOrCreateFileTestItem(file, workspaceFolder);
        }

        return watcher;
      })
    );
  }

  function getOrCreateFileTestItem(uri: vscode.Uri, workspaceFolder: vscode.WorkspaceFolder) {
    let fileTestItem = testController.items.get(uri.toString());
    if (fileTestItem !== undefined) {
      return fileTestItem;
    }
    // file not in controller items
    fileTestItem = testController.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
    testController.items.add(fileTestItem);
    testData.set(fileTestItem, { workspaceUri: workspaceFolder.uri });
    return fileTestItem;
  }

  return testController;
}

function initTestRunning(controller: vscode.TestController) {
  function runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ) {
    const run = controller.createTestRun(request);
    const queue: vscode.TestItem[] = [];

    // Loop through all included tests, or all known tests, and add them to our queue
    if (request.include) {
      // according to filter
      request.include.forEach((testItem) => queue.push(testItem));
    } else {
      // all
      controller.items.forEach((testItem) => queue.push(testItem));
    }
    while (queue.length > 0 && !token.isCancellationRequested) {
      const testItem = queue.pop()!;

      if (request.exclude?.includes(testItem)) {
        continue;
      }

      if (testItem.uri === undefined) {
        continue;
      }

      const parentDir = path.resolve(testItem.uri.fsPath, '..');

      run.appendOutput(`Running ${testItem.label}\r\n\r\n`); // \r\n required as per vscode docs
      run.started(testItem);

      const mfArgs = [
        '-interaction=nonstopmode',
        '-output-directory=' + parentDir,
        '\\' + 'input ' + testItem.uri.fsPath + ';'
      ];
      const testItemData = testData.get(testItem);
      const workspacePath = testItemData?.workspaceUri.fsPath;

      const start = Date.now();
      const ret = childProcess.spawnSync(
        'mf',
        mfArgs,
        { cwd: workspacePath }
      );
      const duration = Date.now() - start;

      let stdout = ret.stdout.toString();
      stdout = stdout.replaceAll('\n', '\r\n'); // \r\n required as per vscode docs
      run.appendOutput(stdout);
      const returnStatus = ret.status;

      if (returnStatus === 0) {
        run.passed(testItem, duration);
      } else {
        run.failed(testItem, [], duration);
      }

      run.appendOutput(`\r\nCompleted ${testItem.label}\r\n`);
    }
    run.end();
  }

  controller.createRunProfile(
    'Run Tests',
    vscode.TestRunProfileKind.Run,
    runHandler,
    true
  );
}
