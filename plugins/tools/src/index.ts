import QRCode from 'qrcode';
import { z } from 'zod';
import type { ToolPlugin } from '@nexus/shared';
const qrInput = z.object({
  text: z.string().min(1).max(2000),
  format: z.enum(['png', 'svg']).default('png'),
  size: z.number().int().min(128).max(2048).default(512),
  correction: z.enum(['L', 'M', 'Q', 'H']).default('M'),
}).strict();
export const qrPlugin: ToolPlugin = {
  descriptor: { id: 'qr', name: 'QR generator', description: 'Turn text or a link into a crisp, downloadable QR code.', category: 'create', mode: 'instant' },
  validate(input) { qrInput.parse(input); },
  async run(input, context) {
    const value = qrInput.parse(input);
    context.signal.throwIfAborted();
    const options = { width: value.size, margin: 2, errorCorrectionLevel: value.correction };
    const data = value.format === 'svg'
      ? Buffer.from(await QRCode.toString(value.text, { ...options, type: 'svg' }))
      : await QRCode.toBuffer(value.text, options);
    context.signal.throwIfAborted();
    return [{ name: `qr-code.${value.format}`, mime: value.format === 'svg' ? 'image/svg+xml' : 'image/png', data }];
  },
};
export const tools: readonly ToolPlugin[] = [qrPlugin];
