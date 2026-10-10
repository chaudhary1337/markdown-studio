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

// 2. Server build (Node/CJS, bundled so it ships in the VSIX without tsx)
const serverBuild = esbuild.build({
  ...commonOptions,
  entryPoints: ["server/index.ts"],
  outfile: "dist/server.js",
  platform: "node",
  format: "cjs",
});

// 3. Webview build (browser, ESM with code-splitting so heavy deps like
// mermaid can be dynamically imported and ship as separate chunks).
const webviewBuild = esbuild.build({
  ...commonOptions,
  entryPoints: ["webview/index.tsx"],
  outdir: "dist",
  entryNames: "webview",
  chunkNames: "chunks/webview-[hash]",
  splitting: true,
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

// Themes. The list comes from the `markdownStudio.theme` enum in package.json.
// `github-*` themes are generated from GitHub's design system
// (@primer/primitives): only the tokens themes/base.css reads are extracted,
// with var() chains resolved, so each costs ~2 KB instead of ~120 KB. Every
// other theme is a hand-written webview/styles/themes/<name>.css defining
// the same tokens; the build fails if one is missing.
const THEMES_DIR = path.join(__dirname, "webview", "styles", "themes");
const PRIMER_THEMES_DIR = path.join(
  __dirname,
  "node_modules",
  "@primer",
  "primitives",
  "dist",
  "css",
  "functional",
  "themes"
);
const THEME_NAMES = require("./package.json").contributes.configuration.properties[
  "markdownStudio.theme"
].enum.filter((name) => name !== "default");

function parseTokens(css) {
  const tokens = {};
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const [, name, value] of stripped.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (!(name in tokens)) tokens[name] = value.trim();
  }
  return tokens;
}

function githubThemeCss(theme, required) {
  const primerName = theme.slice("github-".length);
  const tokens = parseTokens(
    fs.readFileSync(path.join(PRIMER_THEMES_DIR, `${primerName}.css`), "utf-8")
  );
  const resolve = (name) => {
    if (!(name in tokens)) {
      throw new Error(`@primer/primitives ${primerName}: missing --${name}`);
    }
    return tokens[name].replace(/var\(--([\w-]+)\)/g, (_, ref) => resolve(ref));
  };
  const scheme = primerName.startsWith("dark") ? "dark" : "light";
  const lines = required.map((name) => `  --${name}: ${resolve(name)};`);
  return `body[data-theme="${theme}"] {\n  color-scheme: ${scheme};\n${lines.join("\n")}\n}\n`;
}

function customThemeCss(theme, required) {
  const css = fs.readFileSync(path.join(THEMES_DIR, `${theme}.css`), "utf-8");
  const tokens = parseTokens(css);
  const missing = required.filter((name) => !(name in tokens));
  if (missing.length) {
    throw new Error(`${theme}.css: missing ${missing.map((name) => `--${name}`).join(", ")}`);
  }
  return css;
}

function themesCss() {
  const base = fs.readFileSync(path.join(THEMES_DIR, "base.css"), "utf-8");
  const required = [
    ...new Set([...base.matchAll(/var\(--([\w-]+)\)/g)].map((match) => match[1])),
  ].filter((name) => !name.startsWith("vscode-"));
  const themes = THEME_NAMES.map((theme) =>
    theme.startsWith("github-")
      ? githubThemeCss(theme, required)
      : customThemeCss(theme, required)
  );
  return [...themes, base].join("\n");
}

// 3. Copy CSS (editor + bundled diff2html + KaTeX styles + themes) and KaTeX fonts
function copyCSS() {
  const src = path.join(__dirname, "webview", "styles", "editor.css");
  const dest = path.join(__dirname, "dist", "editor.css");
  const diff2htmlCss = path.join(
    __dirname,
    "node_modules",
    "diff2html",
    "bundles",
    "css",
    "diff2html.min.css"
  );
  const katexCss = path.join(
    __dirname,
    "node_modules",
    "katex",
    "dist",
    "katex.min.css"
  );
  fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
  const editor = fs.readFileSync(src, "utf-8");
  const d2h = fs.readFileSync(diff2htmlCss, "utf-8");
  const katex = fs.readFileSync(katexCss, "utf-8");
  // Themes go last so their body[data-theme] overrides win ties.
  fs.writeFileSync(
    dest,
    editor + "\n\n/* diff2html */\n" + d2h + "\n\n/* katex */\n" + katex + "\n\n/* themes */\n" + themesCss()
  );

  // Copy KaTeX fonts so CSS relative paths (fonts/...) resolve correctly
  const katexFontsDir = path.join(__dirname, "node_modules", "katex", "dist", "fonts");
  const distFontsDir = path.join(__dirname, "dist", "fonts");
  fs.mkdirSync(distFontsDir, { recursive: true });
  for (const file of fs.readdirSync(katexFontsDir)) {
    fs.copyFileSync(path.join(katexFontsDir, file), path.join(distFontsDir, file));
  }
}

Promise.all([extensionBuild, serverBuild, webviewBuild])
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
          entryPoints: ["server/index.ts"],
          outfile: "dist/server.js",
          platform: "node",
          format: "cjs",
        }).then((ctx) => ctx.watch()),
        esbuild.context({
          ...commonOptions,
          entryPoints: ["webview/index.tsx"],
          outdir: "dist",
          entryNames: "webview",
          chunkNames: "chunks/webview-[hash]",
          splitting: true,
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
