// Reads the text out of an EPUB file in the browser. Nothing is uploaded:
// the file is unzipped and parsed on the reader's own device.

import JSZip from "jszip";
import type { Section } from "./chunk";

const BLOCK = new Set([
  "p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote",
  "pre", "tr", "br", "hr", "dt", "dd", "figcaption", "header", "footer", "aside",
]);
const SKIP = new Set(["script", "style", "nav", "head", "svg", "math"]);

function textOf(node: Node, out: string[]) {
  if (node.nodeType === 3) {
    out.push(node.nodeValue ?? "");
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = (node as Element).localName.toLowerCase();
  if (SKIP.has(tag)) return;
  const block = BLOCK.has(tag);
  if (block) out.push("\n\n");
  node.childNodes.forEach((child) => textOf(child, out));
  if (block) out.push("\n\n");
}

function parse(markup: string, type: DOMParserSupportedType): Document {
  return new DOMParser().parseFromString(markup, type);
}

function resolvePath(base: string, href: string): string {
  const stack = base.split("/").slice(0, -1);
  for (const part of decodeURIComponent(href.split("#")[0]).split("/")) {
    if (part === "..") stack.pop();
    else if (part && part !== ".") stack.push(part);
  }
  return stack.join("/");
}

export interface ParsedBook {
  title: string | null;
  author: string | null;
  sections: Section[];
}

export async function parseEpub(data: ArrayBuffer | Uint8Array | Blob): Promise<ParsedBook> {
  const zip = await JSZip.loadAsync(data);

  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("This file isn't a valid EPUB (no container.xml).");
  const opfPath = parse(containerXml, "application/xml")
    .getElementsByTagName("rootfile")[0]
    ?.getAttribute("full-path");
  const opfXml = opfPath ? await zip.file(opfPath)?.async("string") : undefined;
  if (!opfPath || !opfXml) throw new Error("This EPUB is missing its package file.");

  const opf = parse(opfXml, "application/xml");
  const first = (name: string) =>
    opf.getElementsByTagNameNS("*", name)[0]?.textContent?.trim() || null;

  const manifest = new Map<string, { href: string; type: string }>();
  for (const item of Array.from(opf.getElementsByTagNameNS("*", "item"))) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, { href, type: item.getAttribute("media-type") ?? "" });
  }

  const sections: Section[] = [];
  for (const ref of Array.from(opf.getElementsByTagNameNS("*", "itemref"))) {
    const item = manifest.get(ref.getAttribute("idref") ?? "");
    if (!item || !/html/i.test(item.type)) continue;
    const markup = await zip.file(resolvePath(opfPath, item.href))?.async("string");
    if (!markup) continue;

    let doc = parse(markup, "application/xhtml+xml");
    if (doc.getElementsByTagName("parsererror").length || !doc.body) doc = parse(markup, "text/html");
    if (!doc.body) continue;

    const out: string[] = [];
    textOf(doc.body, out);
    const text = out
      .join("")
      .replace(/[ \t ]+/g, " ")
      .replace(/ ?\n ?/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) continue;

    const heading = doc.body.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim();
    sections.push({ title: heading && heading.length <= 120 ? heading : null, text });
  }

  if (sections.length === 0) throw new Error("No readable text was found in this EPUB.");
  return { title: first("title"), author: first("creator"), sections };
}
