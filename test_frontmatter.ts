import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

const md = `---
name: games-vm
description: SSH into the games VM
argument-hint: <command-to-run>
allowed-tools: Bash
---

# Test document

Some content here.`;

async function test() {
  // Step 1: Parse to AST
  const ast = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .parse(md);
  
  console.log("=== AST ===");
  console.log(JSON.stringify(ast, null, 2));
  
  // Step 2: Convert to HTML
  const htmlResult = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);
  
  console.log("\n=== HTML ===");
  console.log(String(htmlResult));
}

test().catch(err => console.error(err));
