import { PDFDocument } from 'pdf-lib';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { ToolPlugin } from '@nexus/shared';
const inputSchema = z.object({ pages: z.string().max(1500).default('') }).strict();
export function parsePages(text: string, count: number): number[] {
  if (!text.trim()) return Array.from({ length: count }, (_, i) => i);
  const output: number[] = [];
  for (const part of text.split(',')) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!match) throw new Error('Pages must look like 1-3,5.');
    const start = Number(match[1]); const end = Number(match[2] || match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > count || output.length + end - start + 1 > 500) throw new Error('Page range is outside this document.');
    for (let page = start; page <= end; page++) output.push(page - 1);
  }
  return output;
}
export const pdfPlugin: ToolPlugin = {
  descriptor: { id: 'pdf', name: 'PDF merge & extract', description: 'Combine PDFs, or extract selected pages into a new document.', category: 'document', mode: 'job' },
  validate(input) { inputSchema.parse(input); },
  async run(input, context) {
    const value = inputSchema.parse(input);
    if (context.files.length < 1 || context.files.length > 10 || context.files.reduce((sum, file) => sum + file.bytes, 0) > 20 * 1024 * 1024) throw new Error('Choose 1–10 PDFs, up to 20 MB in total.');
    if (value.pages.trim() && context.files.length !== 1) throw new Error('Page selection is available for one PDF at a time.');
    const output = await PDFDocument.create();
    for (const [index, file] of context.files.entries()) {
      context.signal.throwIfAborted();
      const source = await PDFDocument.load(await readFile(file.path), { updateMetadata: false });
      if (source.getPageCount() > 500) throw new Error('PDFs with more than 500 pages are not supported in this preview.');
      const indices = parsePages(value.pages, source.getPageCount());
      if (output.getPageCount() + indices.length > 500) throw new Error('Output is limited to 500 pages.');
      for (const page of await output.copyPages(source, indices)) output.addPage(page);
      context.progress(Math.round((index + 1) / context.files.length * 85), 'Copying PDF pages');
    }
    const path = join(context.workDir, 'document.pdf');
    await writeFile(path, await output.save());
    context.signal.throwIfAborted();
    return [{ path, name: context.files.length > 1 ? 'merged.pdf' : 'extracted.pdf', mime: 'application/pdf' }];
  },
};
