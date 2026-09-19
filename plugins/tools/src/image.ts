import sharp from 'sharp';
import { z } from 'zod';
import { join } from 'node:path';
import type { ToolPlugin } from '@nexus/shared';
const inputSchema = z.object({
  format: z.enum(['png', 'jpeg', 'webp']).default('webp'),
  width: z.number().int().min(16).max(4096).optional(),
  quality: z.number().int().min(10).max(100).default(85),
}).strict();
export const imagePlugin: ToolPlugin = {
  descriptor: { id: 'image', name: 'Image converter', description: 'Resize images and convert between PNG, JPEG and WebP.', category: 'image', mode: 'job' },
  validate(input) { inputSchema.parse(input); },
  async run(input, context) {
    const value = inputSchema.parse(input);
    if (context.files.length !== 1 || context.files[0].bytes > 20 * 1024 * 1024) throw new Error('Choose one raster image up to 20 MB.');
    context.signal.throwIfAborted();
    const file = context.files[0];
    const options = { limitInputPixels: 40_000_000, animated: false, failOn: 'error' as const };
    const metadata = await sharp(file.path, options).metadata();
    if (!metadata.format || !['png', 'jpeg', 'webp', 'gif', 'avif', 'tiff'].includes(metadata.format)) throw new Error('Unsupported image format.');
    context.progress(20, 'Decoding image');
    let operation = sharp(file.path, options).rotate().timeout({ seconds: 60 });
    if (value.width) operation = operation.resize({ width: value.width, withoutEnlargement: true });
    if (value.format === 'jpeg') operation = operation.flatten({ background: '#ffffff' });
    const path = join(context.workDir, `converted.${value.format === 'jpeg' ? 'jpg' : value.format}`);
    await operation.toFormat(value.format, { quality: value.quality }).toFile(path);
    context.signal.throwIfAborted();
    context.progress(95, 'Image converted');
    return [{ path, name: `converted.${value.format === 'jpeg' ? 'jpg' : value.format}`, mime: `image/${value.format}` }];
  },
};
