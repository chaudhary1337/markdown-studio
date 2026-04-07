import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import remarkStringify from "remark-stringify";
import rehypeStringify from "rehype-stringify";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";

const md = `---
name: games-vm
description: SSH into the games VM
argument-hint: <command-to-run>
allowed-tools: Bash
---

# Test document

Some content here.`;

async function test() {
  // Step 1: MD to HTML
  const htmlResult = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(md);
  
  const html = String(htmlResult);
  console.log("=== HTML ===");
  console.log(html);
  
  // Step 2: HTML back to MD
  const mdResult = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeRemark)
    .use(remarkGfm)
    .use(remarkStringify)
    .process(html);
  
  const output = String(mdResult);
  console.log("\n=== OUTPUT MARKDOWN ===");
  console.log(output);
  
  console.log("\n=== COMPARISON ===");
  console.log("Input:");
  console.log(md);
  console.log("\nOutput:");
  console.log(output);
}

test().catch(err => console.error(err));
