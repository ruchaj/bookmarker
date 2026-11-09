// The storage engine: plain JSON documents in a folder on disk.
//
// Every change goes through update(), which reads the document, lets the
// caller modify it, and writes it back. Updates to the same file are queued
// so two requests can't overwrite each other, and each write lands in a
// temporary file first so a crash can't leave a half-written document.
//
// This assumes ONE running copy of the app owns the data folder.

import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where the JSON documents live. Set DATA_DIR to move it. */
export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR ?? "data");
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids become file and folder names, so nothing but a generated id may be used as one. */
export function isId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

export function assertId(value: unknown): string {
  if (!isId(value)) throw new Error("Invalid id");
  return value.toLowerCase();
}

type Queue = Map<string, Promise<unknown>>;
const globals = globalThis as typeof globalThis & { __bookmarkerQueues?: Queue };
const queues: Queue = (globals.__bookmarkerQueues ??= new Map());

export async function readJson<T>(file: string, empty: () => T): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw error;
  }
  return JSON.parse(raw) as T;
}

async function writeJson(file: string, value: unknown, pretty: boolean): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, pretty ? 2 : undefined), "utf8");
  await rename(temporary, file);
}

/**
 * Read a document, change it inside `change`, and save it. If `change`
 * throws, nothing is written. Returns whatever `change` returns.
 */
export function update<T, R>(
  file: string,
  empty: () => T,
  change: (document: T) => R | Promise<R>,
  { pretty = true }: { pretty?: boolean } = {},
): Promise<R> {
  const previous = queues.get(file) ?? Promise.resolve();
  const run = previous
    .catch(() => undefined)
    .then(async () => {
      const document = await readJson(file, empty);
      const result = await change(document);
      await writeJson(file, document, pretty);
      return result;
    });
  queues.set(file, run);
  void run
    .catch(() => undefined)
    .finally(() => {
      if (queues.get(file) === run) queues.delete(file);
    });
  return run;
}

/** Delete a document, waiting for any update to it that is still running. */
export async function remove(file: string): Promise<void> {
  await (queues.get(file) ?? Promise.resolve()).catch(() => undefined);
  await rm(file, { force: true });
}
