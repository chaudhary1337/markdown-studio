const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const isWatch = process.argv.includes("--watch");
const isProduction = process.argv.includes("--production");

const commonOptions = {
  bundle: true,
  minify: isProduction,
  sourcemap: !isProduction,
};

// 1. Extension host build (Node/CJS, vscode is external)
const extensionBuild = esbuild.build({
  ...commonOptions,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  external: ["vscode"],
});

// 2. Webview build (browser, ESM so dynamic imports from blocknote are bundled)
const webviewBuild = esbuild.build({
  ...commonOptions,
  entryPoints: ["webview/index.tsx"],
  outfile: "dist/webview.js",
  platform: "browser",
  format: "esm",
  define: {
    "process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
  },
  loader: {
    ".ttf": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".svg": "dataurl",
    ".png": "dataurl",
  },
});

// 3. Copy CSS
function copyCSS() {
  const src = path.join(__dirname, "webview", "styles", "editor.css");
  const dest = path.join(__dirname, "dist", "editor.css");
  fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
  fs.copyFileSync(src, dest);
}

Promise.all([extensionBuild, webviewBuild])
  .then(() => {
    copyCSS();
    console.log("Build complete.");
    if (isWatch) {
      console.log("Watching for changes...");
      // For watch mode, rebuild on changes
      Promise.all([
        esbuild.context({
          ...commonOptions,
          entryPoints: ["src/extension.ts"],
          outfile: "dist/extension.js",
          platform: "node",
          format: "cjs",
          external: ["vscode"],
        }).then((ctx) => ctx.watch()),
        esbuild.context({
          ...commonOptions,
          entryPoints: ["webview/index.tsx"],
          outfile: "dist/webview.js",
          platform: "browser",
          format: "esm",
          define: {
            "process.env.NODE_ENV": '"development"',
          },
          loader: {
            ".ttf": "dataurl",
            ".woff": "dataurl",
            ".woff2": "dataurl",
            ".svg": "dataurl",
            ".png": "dataurl",
          },
        }).then((ctx) => ctx.watch()),
      ]);
    }
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
