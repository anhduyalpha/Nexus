import type { ToolPlugin } from '@nexus/shared';
import { qrPlugin } from './qr.ts';
import { imagePlugin } from './image.ts';
import { pdfPlugin } from './pdf.ts';
import { zipCreatePlugin, zipExtractPlugin, zipListPlugin } from './archive.ts';
import { mediaPlugin } from './media.ts';
export { qrPlugin } from './qr.ts';
export const tools: readonly ToolPlugin[] = [qrPlugin, imagePlugin, pdfPlugin, zipCreatePlugin, zipExtractPlugin, zipListPlugin, mediaPlugin];
