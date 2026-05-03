#!/usr/bin/env npx tsx
/**
 * Standalone dev server for Markdown Studio.
 *
 * Usage:  npx tsx server/index.ts [file.md]
 *    or:  npm run serve -- [file.md]
 *
 * Supports multiple files via browser tabs:
 *   http://localhost:3333/edit?file=/absolute/path/to/file.md
 *
 * Each tab gets its own WebSocket, file watcher, and live save.
 * The CLI arg is optional — if given, auto-opens that file.
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { WebSocketServer, WebSocket } from "ws";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT || "3333", 10);
const DIST = path.resolve(__dirname, "..", "dist");
const SETTINGS_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || ".",
  ".better-markdown-settings.json"
);

// ---------------------------------------------------------------------------
// Settings persistence (simple JSON file)
// ---------------------------------------------------------------------------

function loadSettings(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveSettings(settings: Record<string, unknown>) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ---------------------------------------------------------------------------
// Per-file state: tracks clients, watcher, and last-written content
// ---------------------------------------------------------------------------

interface FileState {
  filePath: string;
  dirPath: string;
  lastWrittenContent: string;
  clients: Set<WebSocket>;
  watcher: fs.FSWatcher | null;
  watchDebounce: ReturnType<typeof setTimeout> | null;
}

const openFiles = new Map<string, FileState>();

function getOrCreateFileState(filePath: string): FileState {
  let state = openFiles.get(filePath);
  if (state) return state;

  const dirPath = path.dirname(filePath);
  state = {
    filePath,
    dirPath,
    lastWrittenContent: "",
    clients: new Set(),
    watcher: null,
    watchDebounce: null,
  };

  // Start watching the file for external changes
  try {
    state.watcher = fs.watch(filePath, () => {
      if (state!.watchDebounce) clearTimeout(state!.watchDebounce);
      state!.watchDebounce = setTimeout(() => {
        try {
          const content = fs.readFileSync(filePath, "utf-8");
          if (content !== state!.lastWrittenContent) {
            state!.lastWrittenContent = content;
            const msg = JSON.stringify({ type: "update", content });
            for (const ws of state!.clients) {
              if (ws.readyState === WebSocket.OPEN) ws.send(msg);
            }
          }
        } catch { /* file may have been deleted */ }
      }, 200);
    });
  } catch { /* watch may fail on some systems */ }

  openFiles.set(filePath, state);
  return state;
}

function removeClient(state: FileState, ws: WebSocket) {
  state.clients.delete(ws);
  // Clean up when no clients remain for this file
  if (state.clients.size === 0) {
    if (state.watcher) state.watcher.close();
    if (state.watchDebounce) clearTimeout(state.watchDebounce);
    openFiles.delete(state.filePath);
  }
}

// ---------------------------------------------------------------------------
// Encode/decode directory paths for image-serving routes
// ---------------------------------------------------------------------------

function encodeDir(dir: string): string {
  return Buffer.from(dir).toString("base64url");
}

function decodeDir(encoded: string): string {
  return Buffer.from(encoded, "base64url").toString();
}

// ---------------------------------------------------------------------------
// HTML shell
// ---------------------------------------------------------------------------

function buildHtml(filePath: string): string {
  const name = path.basename(filePath);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="/editor.css" rel="stylesheet">
  <title>${name} — Markdown Studio</title>
</head>
<body>
  <div id="root"></div>
  <script>window.__BTRMK_FILE__ = ${JSON.stringify(filePath)};</script>
  <script type="module" src="/webview.js"></script>
</body>
</html>`;
}

function buildErrorHtml(title: string, filePath: string, detail?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Studio</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #1e1e1e; color: #d4d4d4; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .box { max-width: 520px; text-align: center; }
    h1 { font-size: 20px; color: #f48771; margin-bottom: 8px; }
    .path { font-family: monospace; font-size: 13px; color: #888; word-break: break-all; margin: 12px 0; }
    p { font-size: 14px; line-height: 1.6; color: #aaa; }
    code { background: rgba(255,255,255,0.08); padding: 2px 5px; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="box">
    <h1>${title}</h1>
    <div class="path">${filePath}</div>
    <p>${detail || 'Markdown Studio only supports <code>.md</code> (Markdown) files.'}</p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "application/javascript",
  ".css": "text/css", ".json": "application/json",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp",
};

function serveStatic(filePath: string, res: http.ServerResponse): boolean {
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }
  } catch { /* fall through */ }
  return false;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  // /edit/<absolute-path> → editor for that file
  if (pathname.startsWith("/edit/")) {
    const file = "/" + pathname.slice("/edit/".length);
    if (!fs.existsSync(file)) {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end(buildErrorHtml("File not found", file, "Check the path and try again."));
      return;
    }
    if (fs.statSync(file).isDirectory()) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(buildErrorHtml(
        "This is a directory, not a file",
        file,
        "Markdown Studio only supports <code>.md</code> files. Open a specific markdown file instead."
      ));
      return;
    }
    if (!file.toLowerCase().endsWith(".md")) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(buildErrorHtml(
        "Unsupported file type",
        file,
        "Markdown Studio only supports <code>.md</code> (Markdown) files."
      ));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(buildHtml(path.resolve(file)));
    return;
  }

  // / → redirect to /edit/<path> if CLI arg given, else show help
  if (pathname === "/") {
    const initialFile = process.argv[2];
    if (initialFile) {
      const abs = path.resolve(initialFile);
      res.writeHead(302, { Location: `/edit${abs}` });
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Markdown Studio server running. Open /edit/<path-to-file.md> to edit a file.");
    }
    return;
  }

  // Image upload: POST /upload/<base64dir>/<filename>
  if (req.method === "POST" && pathname.startsWith("/upload/")) {
    const uploadMatch = pathname.match(/^\/upload\/([^/]+)\/(.+)$/);
    if (!uploadMatch) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid upload path" }));
      return;
    }
    const dir = decodeDir(uploadMatch[1]);
    const safeName = path.basename(decodeURIComponent(uploadMatch[2]));
    // Generate unique filename if conflict
    let finalName = safeName;
    let counter = 1;
    while (fs.existsSync(path.join(dir, finalName))) {
      const ext = path.extname(safeName);
      const base = path.basename(safeName, ext);
      finalName = `${base}-${counter}${ext}`;
      counter++;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        fs.writeFileSync(path.join(dir, finalName), Buffer.concat(chunks));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, filename: finalName }));
      } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // /doc/<base64dir>/<filename> → serve image from document folder
  const docMatch = pathname.match(/^\/doc\/([^/]+)\/(.+)$/);
  if (docMatch) {
    const dir = decodeDir(docMatch[1]);
    const file = docMatch[2];
    if (serveStatic(path.join(dir, file), res)) return;
    res.writeHead(404); res.end("Not found");
    return;
  }

  // Static files from dist/
  if (serveStatic(path.join(DIST, pathname), res)) return;

  res.writeHead(404);
  res.end("Not found");
});

// ---------------------------------------------------------------------------
// WebSocket — /ws?file=<path>
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });

// Upgrade handler: accept /ws/<absolute-path>
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/ws/")) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const filePath = "/" + decodeURIComponent(url.pathname.slice("/ws/".length));

  if (!filePath || !fs.existsSync(filePath)) {
    ws.close(1008, "Invalid file path");
    return;
  }

  const state = getOrCreateFileState(filePath);
  state.clients.add(ws);

  ws.on("message", (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      case "ready": {
        const content = fs.readFileSync(filePath, "utf-8");
        state.lastWrittenContent = content;
        const encodedDir = encodeDir(state.dirPath);
        ws.send(JSON.stringify({
          type: "init",
          content,
          baseUri: `http://localhost:${PORT}/doc/${encodedDir}`,
          docFolderPath: state.dirPath,
          filePath,
          isReadonly: false,
          settings: loadSettings(),
        }));
        break;
      }
      case "edit": {
        if (msg.content !== state.lastWrittenContent) {
          state.lastWrittenContent = msg.content;
          fs.writeFileSync(filePath, msg.content);
        }
        break;
      }
      case "saveSettings": {
        saveSettings(msg.settings);
        // Broadcast to all clients across all files
        for (const [, s] of openFiles) {
          for (const other of s.clients) {
            if (other !== ws && other.readyState === WebSocket.OPEN) {
              other.send(JSON.stringify({ type: "settingsUpdated", settings: msg.settings }));
            }
          }
        }
        break;
      }
      case "openLink": {
        const href = msg.href as string;
        if (href) {
          import("node:child_process").then(({ exec }) => {
            const cmd =
              process.platform === "darwin" ? `open "${href}"` :
              process.platform === "win32" ? `start "${href}"` :
              `xdg-open "${href}"`;
            exec(cmd);
          });
        }
        break;
      }
      case "promptImageUrl": {
        ws.send(JSON.stringify({ type: "imageUrlResult", url: null }));
        break;
      }
      case "requestGitDiff": {
        import("node:child_process").then(({ execSync }) => {
          try {
            const headContent = execSync(
              `git show HEAD:"${path.relative(process.cwd(), filePath)}"`,
              { encoding: "utf-8", cwd: state.dirPath }
            );
            ws.send(JSON.stringify({
              type: "gitDiffResponse", headContent,
              fileName: path.basename(filePath),
            }));
          } catch {
            ws.send(JSON.stringify({
              type: "gitDiffResponse", headContent: null,
              fileName: path.basename(filePath),
            }));
          }
        });
        break;
      }
      case "toggleEditor": {
        // Open in VS Code
        import("node:child_process").then(({ exec }) => {
          exec(`code "${filePath}"`);
        });
        break;
      }
    }
  });

  ws.on("close", () => removeClient(state, ws));
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  const initialFile = process.argv[2];
  console.log(`\n  Markdown Studio server`);
  console.log(`  http://localhost:${PORT}`);
  if (initialFile) {
    const abs = path.resolve(initialFile);
    const url = `http://localhost:${PORT}/edit${abs}`;
    console.log(`  Opening: ${path.basename(abs)}`);
    console.log();
    const cmd =
      process.platform === "darwin" ? `open "${url}"` :
      process.platform === "win32" ? `start "${url}"` :
      `xdg-open "${url}"`;
    import("node:child_process").then(({ exec }) => exec(cmd));
  } else {
    console.log(`  Open /edit?file=<path> to edit a file.\n`);
  }
});
