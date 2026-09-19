import { execa } from 'execa';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { ToolPlugin } from '@nexus/shared';
const inputSchema = z.object({ format: z.enum(['mp3', 'wav', 'mp4', 'webm']).default('mp3') }).strict();
const demuxers = 'mov,matroska,webm,wav,mp3,flac,ogg';
export const mediaPlugin: ToolPlugin = {
  descriptor: { id: 'media', name: 'Media converter', description: 'Convert audio and video locally with FFmpeg.', category: 'media', mode: 'job' },
  validate(input) { inputSchema.parse(input); },
  async checkAvailability() {
    try { await execa('ffmpeg', ['-version'], { timeout: 3000 }); await execa('ffprobe', ['-version'], { timeout: 3000 }); return undefined; }
    catch { return 'Install FFmpeg and ffprobe on the server PATH, then restart Nexus.'; }
  },
  async run(input, context) {
    const value = inputSchema.parse(input);
    if (context.files.length !== 1) throw new Error('Choose one media file.');
    const file = context.files[0];
    const handle = await open(file.path, 'r');
    const header = Buffer.alloc(16);
    try { await handle.read(header, 0, 16, 0); } finally { await handle.close(); }
    const supported = header.subarray(4, 8).toString() === 'ftyp' || header.readUInt32BE(0) === 0x1a45dfa3 || ['OggS', 'fLaC'].includes(header.subarray(0, 4).toString()) || (header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WAVE') || header.subarray(0, 3).toString() === 'ID3' || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0);
    if (!supported) throw new Error('Choose a supported binary media file, not a playlist or URL.');
    const probe = await execa('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', demuxers, '-show_entries', 'format=duration', '-of', 'json', file.path], { cancelSignal: context.signal, timeout: 10000, maxBuffer: 1024 * 1024 });
    const duration = Number((JSON.parse(probe.stdout) as { format?: { duration?: string } }).format?.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1800) throw new Error('Media duration must be known and no longer than 30 minutes.');
    const path = join(context.workDir, `converted.${value.format}`);
    const formatArgs: Record<typeof value.format, string[]> = {
      mp3: ['-vn', '-c:a', 'libmp3lame', '-b:a', '192k'],
      wav: ['-vn', '-c:a', 'pcm_s16le'],
      mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-c:a', 'aac', '-movflags', '+faststart'],
      webm: ['-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '6', '-c:a', 'libopus'],
    };
    const process = execa('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe', '-format_whitelist', demuxers, '-threads', '2', '-i', file.path, ...formatArgs[value.format], '-threads', '2', '-fs', String(100 * 1024 * 1024), '-progress', 'pipe:1', '-nostats', '-y', path], { cancelSignal: context.signal, timeout: 180000, buffer: false });
    let remainder = '';
    process.stdout?.on('data', (chunk: Buffer) => {
      remainder += chunk.toString();
      const lines = remainder.split('\n'); remainder = lines.pop() || '';
      for (const line of lines) if (line.startsWith('out_time_us=')) context.progress(Math.min(95, Math.round(Number(line.slice(12)) / 1_000_000 / duration * 95)), 'Converting media');
    });
    process.stderr?.resume();
    await process;
    context.signal.throwIfAborted();
    const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm' }[value.format];
    return [{ path, name: `converted.${value.format}`, mime }];
  },
};
