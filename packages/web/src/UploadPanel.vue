<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { Upload } from 'tus-js-client';
import { UploadCloud, Pause, Play, X } from 'lucide-vue-next';
import type { StoredFile } from '@nexus/shared';
import { api } from './api.ts';
const emit = defineEmits<{ uploaded: [file: StoredFile] }>();
const busy = ref(false); const paused = ref(false); const percent = ref(0); const name = ref(''); const error = ref('');
let active: Upload | undefined;
let cancelled = false;
let rejectActive: ((reason: Error) => void) | undefined;
async function upload(file: File): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    rejectActive = reject;
    active = new Upload(file, {
      endpoint: '/api/uploads', chunkSize: 5 * 1024 * 1024, retryDelays: [0, 1000, 3000, 5000],
      metadata: { filename: file.name }, removeFingerprintOnSuccess: true,
      onProgress(sent, total) { percent.value = total ? Math.round(sent / total * 100) : 0; },
      onError: reject,
      async onSuccess() {
        try {
          const id = active?.url?.split('/').pop();
          if (!id) throw new Error('Upload completed without an identifier');
          const result = await api<{ file: StoredFile }>(`/upload-results/${encodeURIComponent(id)}`);
          resolve(result.file);
        } catch (failure) { reject(failure); }
      },
    });
    const current = active;
    void current.findPreviousUploads().then(previous => {
      if (cancelled) return reject(new Error('Cancelled'));
      if (previous[0]) current.resumeFromPreviousUpload(previous[0]);
      current.start();
    }).catch(reject);
  });
}
async function choose(event: Event) {
  const element = event.target as HTMLInputElement;
  const files = [...(element.files || [])]; element.value = '';
  if (!files.length || busy.value) return;
  error.value = '';
  if (files.length > 30 || files.some(file => file.size === 0 || file.size > 100 * 1024 * 1024)) { error.value = 'Choose at most 30 files, each between 1 byte and 100 MB.'; return; }
  busy.value = true; cancelled = false;
  try {
    for (const file of files) {
      if (cancelled) break;
      name.value = file.name; percent.value = 0;
      emit('uploaded', await upload(file));
    }
  } catch (failure) { if (!cancelled) error.value = failure instanceof Error ? failure.message : 'Upload failed'; }
  finally { busy.value = false; paused.value = false; active = undefined; rejectActive = undefined; }
}
async function togglePause() {
  if (!active) return;
  if (paused.value) { paused.value = false; active.start(); }
  else { paused.value = true; await active.abort(); }
}
async function cancel() { cancelled = true; await active?.abort(true).catch(() => undefined); rejectActive?.(new Error('Cancelled')); }
onBeforeUnmount(() => { cancelled = true; void active?.abort().catch(() => undefined); rejectActive?.(new Error('Upload paused')); });
</script>
<template>
  <section class="upload-panel" aria-label="Upload files">
    <label class="upload-label"><UploadCloud :size="22"/><span><strong>Add files to your workspace</strong><small>Up to 100 MB per file · resumable upload · stored on your server</small></span><input type="file" multiple :disabled="busy" aria-label="Choose files to upload" @change="choose"/></label>
    <div v-if="busy" class="upload-progress"><div><strong>{{ name }}</strong><span>{{ paused ? 'Paused' : `${percent}%` }}</span></div><progress :value="percent" max="100" aria-label="Upload progress"/><div class="upload-actions"><button class="text-button" type="button" @click="togglePause"><Play v-if="paused" :size="15"/><Pause v-else :size="15"/>{{ paused ? 'Resume' : 'Pause' }}</button><button class="text-button" type="button" @click="cancel"><X :size="15"/>Cancel upload</button></div></div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </section>
</template>
