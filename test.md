# Heading 1

Regular paragraph with some text.

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

## Inline formatting

This has **bold text** and _italic text_ and `inline code` and ~~strikethrough~~.

A sentence with **bold** in the middle and _emphasis_ too.

Mixed: **bold and _italic_ together** and more text.

## Lists

### Unordered

- Item one
- Item two
- Item three with **bold**
- Item with `code`

### Nested unordered

- Parent item
- Child item
- Another child
- Grandchild
- Back to parent

### Ordered

1. First
2. Second
3. Third

### Nested ordered

1. First
2. Sub-first
3. Sub-second
4. Second

### Mixed

- Unordered

1. Ordered child
2. Another ordered

- Back to unordered

## Task lists

- Unchecked task
- Checked task
- Another unchecked
- Another checked

## Links

[Example link](https://example.com)

A paragraph with [inline link](https://example.com) in it.

- List with [link](https://example.com)
- Nested [link](https://example.com/nested)

## Images

![Alt text](image.png)![](no-alt.png)

## Code blocks

```javascript
function hello() {
  console.log("world");
}
```

```python
def hello():
    print("world")
```

```text
plain code block
no language
```

```bash
echo "hello world"
```

## Tables

| Header 1 | Header 2 | Header 3 |
| -------- | -------- | -------- |
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

## Blockquotes

> This is a blockquote.
>
> With multiple paragraphs.

> Nested:
>
> > Inner quote

## Horizontal rules

---

## Special characters

Tildes: ~ single tilde and ~~ double tildes ~~.

Asterisks in text: 2 * 3 = 6.

Escaped characters: * \_ \` \[ ]

## Bold in lists (regression test)

- **Bold list item**
- **Another bold item** with trailing text
- Normal item then **bold part**
- _Italic item_

## Long heading for TOC truncation test

### This is a very long heading that should be truncated in the table of contents because it exceeds one hundred and twenty-eight characters which is the configured maximum length for display

<!-- better-markdown-meta {"h":[{"t":"Heading 4","l":4},{"t":"Heading 5","l":5},{"t":"Heading 6","l":6}]} -->
