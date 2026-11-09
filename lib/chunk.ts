// Splits a book's text into roughly page-sized passages and records where
// each one sits in the book (0 = first character, 1 = last).

export interface Section {
  title: string | null;
  text: string;
}

export interface Chunk {
  idx: number;
  chapter: string | null;
  start_pct: number;
  end_pct: number;
  content: string;
}

export const TARGET_CHARS = 1200;
const MAX_CHARS = 1800;

/** Break one over-long paragraph at sentence ends, then at spaces. */
function splitLong(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHARS) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)\s*/g) ?? [paragraph];
  const out: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };
  for (let sentence of sentences) {
    while (sentence.length > MAX_CHARS) {
      flush();
      const cut = sentence.lastIndexOf(" ", MAX_CHARS);
      const at = cut > MAX_CHARS / 2 ? cut : MAX_CHARS;
      out.push(sentence.slice(0, at).trim());
      sentence = sentence.slice(at);
    }
    if (current.length + sentence.length > TARGET_CHARS) flush();
    current += sentence;
  }
  flush();
  return out;
}

export function chunkSections(sections: Section[]): { chunks: Chunk[]; totalChars: number } {
  type Piece = { chapter: string | null; text: string };
  const pieces: Piece[] = [];

  for (const section of sections) {
    const paragraphs = section.text
      .replace(/\r\n?/g, "\n")
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    let current = "";
    const flush = () => {
      if (current) pieces.push({ chapter: section.title, text: current });
      current = "";
    };
    for (const paragraph of paragraphs) {
      for (const part of splitLong(paragraph)) {
        if (current && current.length + part.length + 2 > TARGET_CHARS) flush();
        current = current ? `${current}\n\n${part}` : part;
      }
    }
    flush();
  }

  const totalChars = pieces.reduce((n, p) => n + p.text.length, 0);
  let offset = 0;
  const chunks = pieces.map((piece, idx) => {
    const start = offset;
    offset += piece.text.length;
    return {
      idx,
      chapter: piece.chapter ? piece.chapter.slice(0, 300) : null,
      start_pct: totalChars ? start / totalChars : 0,
      end_pct: totalChars ? offset / totalChars : 0,
      content: piece.text,
    };
  });

  return { chunks, totalChars };
}

const GUTENBERG_START = /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i;
const GUTENBERG_END = /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;
const HEADING = /^(?:chapter|part|book|volume|prologue|epilogue|introduction|preface)\b.{0,80}$/i;

/** Turn a plain-text file into sections, using chapter-style headings when present. */
export function sectionsFromPlainText(raw: string): Section[] {
  let text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  const start = text.match(GUTENBERG_START);
  if (start?.index !== undefined) text = text.slice(start.index + start[0].length);
  const end = text.match(GUTENBERG_END);
  if (end?.index !== undefined) text = text.slice(0, end.index);

  const sections: Section[] = [];
  let title: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ title, text: body });
    buffer = [];
  };

  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const standsAlone = (lines[i - 1] ?? "").trim() === "" && (lines[i + 1] ?? "").trim() === "";
    if (standsAlone && HEADING.test(line)) {
      flush();
      title = line.replace(/\s+/g, " ");
      continue;
    }
    buffer.push(lines[i]);
  }
  flush();

  return sections;
}
