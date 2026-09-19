<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowDown, ArrowUp, LoaderCircle, Play } from 'lucide-vue-next';
import type { StoredFile, TaskJob, ToolDescriptor } from '@nexus/shared';
import UploadPanel from './UploadPanel.vue';
import { api } from './api.ts';
const props = defineProps<{ tool: ToolDescriptor & { available: boolean; reason?: string }; files: StoredFile[] }>();
const emit = defineEmits<{ uploaded: [file: StoredFile]; created: [job: TaskJob] }>();
const selected = ref<string[]>([]); const busy = ref(false); const error = ref('');
const format = ref(props.tool.id === 'media' ? 'mp3' : 'webp'); const width = ref(0); const quality = ref(85); const pages = ref(''); const entries = ref('');
const hints: Record<string, string> = {
  image: 'One raster image, up to 20 MB and 40 megapixels. Output metadata is stripped.',
  pdf: '1–10 PDFs, up to 20 MB in total and 500 output pages. Encrypted PDFs are not supported.',
  media: 'One MP3, WAV, FLAC, Ogg, MP4 or WebM file, up to 100 MB and 30 minutes. Requires FFmpeg.',
  'zip-create': 'Select 1–30 files. File order is preserved; archive names receive unique numeric prefixes.',
  'zip-extract': 'One ZIP, up to 200 entries and 100 MB expanded. Symlinks, encrypted entries and unsafe paths are rejected.',
  'zip-list': 'One ZIP. Produces a JSON directory listing without extracting entries.',
};
const selectedFiles = computed(() => selected.value.map(id => props.files.find(file => file.id === id)).filter((file): file is StoredFile => Boolean(file)));
function select(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id]; }
function move(index: number, delta: number) { const next = [...selected.value]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; selected.value = next; }
function uploaded(file: StoredFile) { emit('uploaded', file); selected.value = [...selected.value, file.id]; }
async function submit() {
  error.value = ''; busy.value = true;
  const input = props.tool.id === 'image' ? { format: format.value, quality: quality.value, ...(width.value ? { width: width.value } : {}) }
    : props.tool.id === 'media' ? { format: format.value }
    : props.tool.id === 'pdf' ? { pages: pages.value }
    : props.tool.id === 'zip-extract' ? { entries: entries.value.split('\n').map(value => value.trim()).filter(Boolean) } : {};
  try { const response = await api<{ job: TaskJob }>('/jobs', { method: 'POST', body: JSON.stringify({ tool: props.tool.id, input, fileIds: selected.value }) }); emit('created', response.job); }
  catch (failure) { error.value = (failure as Error).message; }
  finally { busy.value = false; }
}
</script>
<template>
  <p v-if="!tool.available" class="setup-note" role="status">{{ tool.reason }}</p>
  <p class="limits-note">{{ hints[tool.id] }}</p>
  <UploadPanel @uploaded="uploaded"/>
  <form class="processing-form" @submit.prevent="submit">
    <h2>Choose from your library <span>{{ selected.length }} selected</span></h2>
    <div class="select-files"><label v-for="file in files" :key="file.id"><input type="checkbox" :checked="selected.includes(file.id)" @change="select(file.id)"/><span>{{ file.name }}</span><small>{{ (file.bytes / 1024).toFixed(1) }} KB</small></label><p v-if="!files.length" class="empty">Upload an input file to begin.</p></div>
    <div v-if="selectedFiles.length > 1" class="selected-order"><h3>Processing order</h3><div v-for="(file, index) in selectedFiles" :key="file.id"><span>{{ index + 1 }}. {{ file.name }}</span><button type="button" class="icon-button" :aria-label="`Move ${file.name} up`" :disabled="index === 0" @click="move(index, -1)"><ArrowUp :size="15"/></button><button type="button" class="icon-button" :aria-label="`Move ${file.name} down`" :disabled="index === selectedFiles.length - 1" @click="move(index, 1)"><ArrowDown :size="15"/></button></div></div>
    <div class="processing-options">
      <template v-if="tool.id === 'image'"><label>Output format<select v-model="format"><option value="webp">WebP</option><option value="png">PNG</option><option value="jpeg">JPEG</option></select></label><label>Maximum width<select v-model.number="width"><option :value="0">Keep original size</option><option :value="640">640 pixels</option><option :value="1280">1280 pixels</option><option :value="1920">1920 pixels</option><option :value="4096">4096 pixels</option></select></label><label>Quality<input v-model.number="quality" type="number" min="10" max="100" required/></label></template>
      <label v-if="tool.id === 'media'">Output format<select v-model="format"><option value="mp3">MP3 audio</option><option value="wav">WAV audio</option><option value="mp4">MP4 video</option><option value="webm">WebM video</option></select></label>
      <label v-if="tool.id === 'pdf'">Pages (one PDF only; leave empty to merge all pages)<input v-model="pages" placeholder="For example: 1-3,5"/></label>
      <label v-if="tool.id === 'zip-extract'">Selected entry paths (one per line; leave empty for all)<textarea v-model="entries" rows="3" placeholder="documents/notes.txt"/></label>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <button class="primary" :disabled="busy || !selected.length || !tool.available"><LoaderCircle v-if="busy" :size="17" class="spin"/><Play v-else :size="17"/>{{ busy ? 'Submitting…' : 'Start processing' }}</button>
  </form>
</template>
