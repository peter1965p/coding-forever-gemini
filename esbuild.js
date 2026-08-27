const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Plugin zum Kopieren der sql-wasm.wasm Datei nach dist/
 */
const copyWasmPlugin = {
    name: 'copy-wasm',
    setup(build) {
        build.onEnd(() => {
            const wasmSource = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
            const wasmDest = path.join(__dirname, 'dist', 'sql-wasm.wasm');
            
            // Ordner dist/ sicherstellen, falls er noch nicht existiert
            if (!fs.existsSync(path.join(__dirname, 'dist'))) {
                fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
            }

            if (fs.existsSync(wasmSource)) {
                fs.copyFileSync(wasmSource, wasmDest);
                console.log('[copy-wasm] sql-wasm.wasm erfolgreich nach dist/ kopiert');
            } else {
                console.error('[copy-wasm] Fehler: sql-wasm.wasm in node_modules/sql.js/dist nicht gefunden!');
            }
        });
    }
};

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',
    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                if (location) {
                    console.error(`    ${location.file}:${location.line}:${location.column}:`);
                }
            });
            console.log('[watch] build finished');
        });
    },
};

async function main() {
    // 1. Build-Kontext für den Node.js Backend-Code (Extension Host)
    const extensionCtx = await esbuild.context({
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: ['vscode'],
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin, copyWasmPlugin],
    });

    // 2. Build-Kontext für das React Webview UI (bundle.js für index.html / extension.ts)
    const webviewCtx = await esbuild.context({
        entryPoints: ['src/pages/index.tsx'],
        bundle: true,
        format: 'iife',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'browser',
        outfile: 'dist/bundle.js',
        logLevel: 'silent',
        plugins: [esbuildProblemMatcherPlugin],
    });

    if (watch) {
        await Promise.all([
            extensionCtx.watch(),
            webviewCtx.watch()
        ]);
    } else {
        await extensionCtx.rebuild();
        await extensionCtx.dispose();
        await webviewCtx.rebuild();
        await webviewCtx.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});