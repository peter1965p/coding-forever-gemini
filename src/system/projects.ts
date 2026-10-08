import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

interface ProjectTemplate {
    label: string;
    description: string;
    command: string;
    args: string[];
}

const PROJECT_TEMPLATES: ProjectTemplate[] = [
    {
        label: 'Node.js',
        description: 'Leeres npm-Projekt mit package.json',
        command: 'npm',
        args: ['init', '-y']
    },
    {
        label: 'Node.js + TypeScript',
        description: 'npm-Projekt mit TypeScript und tsconfig.json',
        command: 'npm',
        args: ['init', '-y']
    },
    {
        label: 'React + Vite',
        description: 'Modernes React-Projekt mit TypeScript',
        command: 'npx',
        args: ['--yes', 'create-vite@latest', '.', '--template', 'react-ts']
    },
    {
        label: 'Next.js',
        description: 'Next.js-Projekt mit TypeScript und App Router',
        command: 'npx',
        args: ['--yes', 'create-next-app@latest', '.', '--ts', '--eslint', '--app', '--use-npm', '--no-tailwind']
    }
];

function getNodePackageExecutable(command: string): string {
    if (process.platform !== 'win32') { return command; }
    return command === 'npm' ? 'npm.cmd' : command === 'npx' ? 'npx.cmd' : command;
}

function getPlatformName(): string {
    switch (process.platform) {
        case 'win32': return 'Windows';
        case 'darwin': return 'macOS';
        case 'linux': return 'Linux';
        default: return process.platform;
    }
}

function isCommandAvailable(command: string): Promise<boolean> {
    return new Promise(resolve => {
        const child = spawn(getNodePackageExecutable(command), ['--version'], {
            stdio: 'ignore',
            shell: false
        });
        child.on('error', () => resolve(false));
        child.on('close', code => resolve(code === 0));
    });
}

function runProjectProcess(command: string, args: string[], cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
        let errorOutput = '';
        child.stderr?.on('data', chunk => { errorOutput += chunk.toString(); });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(errorOutput.trim() || `${command} wurde mit Code ${code} beendet.`));
            }
        });
    });
}

export function detectProjectsDirectory(configuredRoot: string | undefined): string {
    if (configuredRoot?.trim()) { return configuredRoot.trim(); }

    const candidates = [
        path.join(os.homedir(), 'Dev'),
        path.join(os.homedir(), 'Documents', 'Dev'),
        vscode.workspace.workspaceFolders?.[0]
            ? path.dirname(vscode.workspace.workspaceFolders[0].uri.fsPath)
            : undefined,
        os.homedir()
    ].filter((candidate): candidate is string => Boolean(candidate));

    return candidates.find(candidate => fs.existsSync(candidate)) || os.homedir();
}

export async function createProject(): Promise<void> {
    if (!(await isCommandAvailable('npm'))) {
        vscode.window.showErrorMessage(
            `Node.js mit npm wurde auf ${getPlatformName()} nicht gefunden. `
            + 'Bitte Node.js installieren und VS Code neu starten.'
        );
        return;
    }

    const picked = await vscode.window.showQuickPick(
        PROJECT_TEMPLATES.map(item => ({ label: item.label, description: item.description, item })),
        { placeHolder: 'Welche Projektform soll erstellt werden?' }
    );
    if (!picked) { return; }

    if (picked.item.command === 'npx' && !(await isCommandAvailable('npx'))) {
        vscode.window.showErrorMessage(
            `npx wurde auf ${getPlatformName()} nicht gefunden. Bitte Node.js aktualisieren und VS Code neu starten.`
        );
        return;
    }

    const configuredRoot = vscode.workspace
        .getConfiguration('codingForever')
        .get<string>('projectsDirectory');
    const rootUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(detectProjectsDirectory(configuredRoot)),
        openLabel: 'Projektbasis verwenden'
    });
    if (!rootUri?.[0]) { return; }

    const projectName = await vscode.window.showInputBox({
        prompt: 'Name des neuen Projektordners',
        placeHolder: 'mein-node-projekt',
        validateInput: value => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
            ? undefined
            : 'Nur Buchstaben, Zahlen, Punkt, Bindestrich und Unterstrich verwenden.'
    });
    if (!projectName) { return; }

    const projectPath = path.join(rootUri[0].fsPath, projectName);
    if (fs.existsSync(projectPath)) {
        vscode.window.showErrorMessage(`Der Projektordner existiert bereits: ${projectPath}`);
        return;
    }

    fs.mkdirSync(projectPath, { recursive: true });

    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Erstelle ${projectName}...` },
            async () => {
                await runProjectProcess(
                    getNodePackageExecutable(picked.item.command),
                    picked.item.args,
                    projectPath
                );

                if (picked.item.label === 'Node.js + TypeScript') {
                    await runProjectProcess(
                        getNodePackageExecutable('npm'),
                        ['install', '--save-dev', 'typescript', 'tsx', '@types/node'],
                        projectPath
                    );
                    await runProjectProcess(
                        getNodePackageExecutable('npx'),
                        ['tsc', '--init'],
                        projectPath
                    );
                }
            }
        );

        const opened = await vscode.commands.executeCommand<boolean>(
            'vscode.openFolder',
            vscode.Uri.file(projectPath),
            false
        );
        if (opened !== false) {
            vscode.window.showInformationMessage(`Projekt erstellt: ${projectName}`);
        }
    } catch (error: any) {
        fs.rmSync(projectPath, { recursive: true, force: true });
        vscode.window.showErrorMessage(`Projekt konnte nicht erstellt werden: ${error.message}`);
    }
}
