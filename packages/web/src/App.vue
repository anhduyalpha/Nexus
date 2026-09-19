<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, ChevronRight, CircleHelp, Clock3, File as FileIcon, Files, Grid2X2, Image, LoaderCircle, LockKeyhole, Music2, QrCode, Search, ShieldCheck, Sparkles, Trash2, X, FileText, Archive } from 'lucide-vue-next';
import type { StoredFile, TaskJob, ToolDescriptor } from '@nexus/shared';
import { api } from './api.ts';
import UploadPanel from './UploadPanel.vue';
import ProcessTool from './ProcessTool.vue';
import JobsPanel from './JobsPanel.vue';
import './processing.css';

type CatalogTool = ToolDescriptor & { available: boolean; reason?: string };
const view = ref('home'); const query = ref('');
const files = ref<StoredFile[]>([]); const jobs = ref<TaskJob[]>([]); const tools = ref<CatalogTool[]>([]);
const loading = ref(true); const busy = ref(false); const error = ref(''); const authenticated = ref(false); const protectedMode = ref(false); const token = ref('');
const text = ref(''); const format = ref('png'); const size = ref(512); const correction = ref('M'); const result = ref<StoredFile>();
const connected = ref(false);
let events: EventSource | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const icons = { create: QrCode, image: Image, document: FileText, archive: Archive, media: Music2 };
const activeTool = computed(() => tools.value.find(tool => tool.id === view.value));
const activeJobs = computed(() => jobs.value.filter(job => ['pending', 'running'].includes(job.status)).length);
const filteredTools = computed(() => tools.value.filter(tool => `${tool.name} ${tool.description}`.toLowerCase().includes(query.value.toLowerCase())));
const filteredFiles = computed(() => files.value.filter(file => file.name.toLowerCase().includes(query.value.toLowerCase())));
const bytes = (value: number) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`;
const date = (value: string) => new Date(value).toLocaleString();
async function refreshJobs() {
  try {
    const [history, library] = await Promise.all([api<{ jobs: TaskJob[] }>('/jobs'), api<{ files: StoredFile[] }>('/files')]);
    jobs.value = history.jobs; files.value = library.files;
  } catch (failure) { error.value = (failure as Error).message; }
}
async function refresh() {
  const [library, catalog, history] = await Promise.all([api<{ files: StoredFile[] }>('/files'), api<{ tools: CatalogTool[] }>('/tools'), api<{ jobs: TaskJob[] }>('/jobs')]);
  files.value = library.files; tools.value = catalog.tools; jobs.value = history.jobs;
}
function connectEvents() {
  events?.close();
  events = new EventSource('/api/events');
  events.onopen = () => { connected.value = true; };
  events.onerror = () => { connected.value = false; };
  events.addEventListener('changed', () => {
    if (refreshTimer) return;
    refreshTimer = setTimeout(() => { refreshTimer = undefined; void refreshJobs(); }, 2000);
  });
}
async function initialize() {
  loading.value = true; error.value = '';
  try {
    const session = await api<{ authenticated: boolean; protected: boolean }>('/session');
    authenticated.value = session.authenticated; protectedMode.value = session.protected;
    if (session.authenticated) { await refresh(); connectEvents(); }
  } catch (failure) { error.value = (failure as Error).message; }
  finally { loading.value = false; }
}
async function login() {
  busy.value = true; error.value = '';
  try { await api('/session', { method: 'POST', body: JSON.stringify({ token: token.value }) }); token.value = ''; await initialize(); }
  catch (failure) { error.value = (failure as Error).message; }
  finally { busy.value = false; }
}
function navigate(next: string) { view.value = next; error.value = ''; query.value = ''; }
function uploaded(file: StoredFile) { files.value = [file, ...files.value.filter(value => value.id !== file.id)]; }
function created(job: TaskJob) { jobs.value = [job, ...jobs.value.filter(value => value.id !== job.id)]; navigate('jobs'); }
async function generate() {
  busy.value = true; error.value = '';
  try {
    const response = await api<{ files: StoredFile[] }>('/tools/qr/run', { method: 'POST', body: JSON.stringify({ text: text.value, format: format.value, size: size.value, correction: correction.value }) });
    result.value = response.files[0]; await refresh();
  } catch (failure) { error.value = (failure as Error).message; }
  finally { busy.value = false; }
}
async function remove(file: StoredFile) {
  if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return;
  try { await api(`/files/${file.id}`, { method: 'DELETE' }); if (result.value?.id === file.id) result.value = undefined; await refresh(); }
  catch (failure) { error.value = (failure as Error).message; }
}
onMounted(initialize);
onBeforeUnmount(() => { events?.close(); if (refreshTimer) clearTimeout(refreshTimer); });
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="navigate('home')"><span class="brand-mark">n</span><span>Nexus<span class="brand-dot">.</span></span></a>
      <div class="workspace-label">PERSONAL WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button :class="{ active: view === 'home' || !!activeTool }" @click="navigate('home')"><Grid2X2 :size="19"/>All tools<span class="nav-count">{{ tools.length }}</span></button>
        <button :class="{ active: view === 'files' }" @click="navigate('files')"><Files :size="19"/>My files<span class="nav-count">{{ files.length }}</span></button>
        <button :class="{ active: view === 'jobs' }" @click="navigate('jobs')"><Clock3 :size="19"/>Activity<span class="nav-count">{{ activeJobs || jobs.length }}</span></button>
      </nav>
      <div class="sidebar-bottom">
        <div class="privacy-note"><ShieldCheck :size="20"/><div><strong>Yours. Always.</strong><p>Your files stay on your hardware.</p></div></div>
        <button class="help-link" @click="navigate('about')"><CircleHelp :size="18"/>About this workspace<ArrowUpRight :size="15"/></button>
        <div class="profile"><span class="avatar">N</span><div><strong>Personal workspace</strong><small>Self-hosted · single user</small></div><span class="online-dot"/></div>
      </div>
    </aside>
    <div class="main-column">
      <header class="topbar"><div class="breadcrumb">Workspace<ChevronRight :size="14"/><strong>{{ activeTool?.name || ({ files: 'My files', jobs: 'Activity', about: 'About' }[view] || 'All tools') }}</strong></div><span class="private-badge"><LockKeyhole :size="13"/>{{ protectedMode ? 'Protected workspace' : 'Local workspace' }}</span></header>
      <main>
        <div v-if="error" class="error" role="alert"><span>{{ error }}</span><button aria-label="Dismiss error" @click="error = ''"><X :size="18"/></button></div>
        <div v-if="loading" class="empty"><LoaderCircle class="spin"/>Connecting to your workspace…</div>
        <form v-else-if="!authenticated" class="login-panel" @submit.prevent="login"><LockKeyhole :size="28"/><h1>Welcome to Nexus</h1><p>Enter your server's access token to unlock this workspace.</p><label for="token">Access token</label><input id="token" v-model="token" type="password" autocomplete="current-password" required/><button class="primary" :disabled="busy">{{ busy ? 'Signing in…' : 'Unlock workspace' }}</button></form>
        <template v-else-if="view === 'home'">
          <div class="eyebrow"><span class="online-dot"/>YOUR PRIVATE TOOLKIT</div>
          <div class="page-heading"><div><h1>Everyday tasks.<br><span>A simpler place.</span></h1><p>Small tools for the things you do every day.<br class="desktop-break">No uploads to strangers. No unnecessary noise.</p></div><div class="heading-note"><ShieldCheck :size="18"/><span>On your hardware.<br>Under your control.</span></div></div>
          <label class="search"><Search :size="19"/><input v-model="query" placeholder="Find a tool…" aria-label="Find a tool"/></label>
          <div class="section-heading"><h2>Your tools</h2><span>{{ filteredTools.length }} tools</span></div>
          <div class="tool-grid">
            <button v-for="tool in filteredTools" :key="tool.id" class="tool-card" @click="navigate(tool.id)"><div class="card-top"><span class="tool-icon" :class="tool.category"><component :is="icons[tool.category]" :size="24"/></span><ArrowUpRight :size="18"/></div><h3>{{ tool.name }}</h3><p>{{ tool.description }}</p><div class="card-bottom"><span>{{ tool.category }}</span><span class="tool-status">{{ tool.available ? 'Ready' : 'Setup needed' }}<span class="online-dot" :class="{ offline: !tool.available }"/></span></div></button>
          </div>
          <p v-if="!filteredTools.length" class="empty">No tools match your search.</p>
          <section class="recent-section">
            <div class="section-heading"><h2>Recent files</h2><button class="text-button" @click="navigate('files')">View all<ArrowUpRight :size="15"/></button></div>
            <div v-if="!files.length" class="empty-files"><div class="empty-icon"><Files :size="25"/></div><h3>A clean start.</h3><p>Create a QR code or upload a file. Your results will appear here.</p><button class="text-button" @click="navigate('qr')">Open QR generator<ArrowUpRight :size="15"/></button></div>
            <div v-else class="file-list"><div v-for="file in files.slice(0, 5)" :key="file.id" class="file-row"><span class="file-icon"><FileIcon :size="20"/></span><div class="file-info"><strong>{{ file.name }}</strong><small>{{ bytes(file.bytes) }} · {{ date(file.createdAt) }}</small></div><a :href="`/api/files/${file.id}`" class="icon-button" :aria-label="`Download ${file.name}`"><ArrowDownToLine :size="18"/></a></div></div>
          </section>
        </template>
        <template v-else-if="view === 'qr'">
          <button class="back text-button" @click="navigate('home')"><ArrowLeft :size="16"/>All tools</button><div class="eyebrow">CREATE / QR CODE</div><h1 class="tool-heading">Make a connection.</h1><p class="page-subtitle">A link, a note, an idea. Turn it into a QR code.</p>
          <div class="editor-grid"><form class="editor-panel" @submit.prevent="generate"><label for="qr-text">Text or link</label><textarea id="qr-text" v-model="text" maxlength="2000" rows="6" placeholder="https://example.com or any text…" required/><small class="field-note">{{ text.length }} / 2,000 characters. Generated on your server.</small><div class="fields-row"><div><label for="format">File format</label><select id="format" v-model="format"><option value="png">PNG image</option><option value="svg">SVG vector</option></select></div><div><label for="size">Size</label><select id="size" v-model.number="size"><option :value="256">256 × 256</option><option :value="512">512 × 512</option><option :value="1024">1024 × 1024</option></select></div></div><details><summary>Advanced options</summary><label for="correction">Error correction</label><select id="correction" v-model="correction"><option value="L">Low</option><option value="M">Medium (recommended)</option><option value="Q">Quartile</option><option value="H">High</option></select></details><button class="primary" :disabled="busy || !text.trim()"><LoaderCircle v-if="busy" class="spin" :size="18"/><QrCode v-else :size="18"/>{{ busy ? 'Generating…' : 'Generate QR code' }}</button></form><div class="preview-panel"><div class="preview-label">OUTPUT PREVIEW</div><template v-if="result"><div class="qr-preview"><img v-if="result.mime === 'image/png'" :src="`/api/files/${result.id}?preview=1`" alt="Generated QR code"/><QrCode v-else :size="110"/></div><div class="success-label"><Check :size="16"/>Saved to your library</div><a class="primary" :href="`/api/files/${result.id}`"><ArrowDownToLine :size="17"/>Download {{ result.mime === 'image/png' ? 'PNG' : 'SVG' }}</a></template><div v-else class="preview-empty"><QrCode :size="72" :stroke-width="1"/><p>Your QR code will appear here</p><small>Ready when you are.</small></div></div></div>
        </template>
        <template v-else-if="activeTool">
          <button class="back text-button" @click="navigate('home')"><ArrowLeft :size="16"/>All tools</button><div class="eyebrow">{{ activeTool.category }} / LOCAL PROCESSING</div><h1 class="tool-heading">{{ activeTool.name }}.</h1><p class="page-subtitle">{{ activeTool.description }}</p><ProcessTool :key="activeTool.id" :tool="activeTool" :files="files" @uploaded="uploaded" @created="created"/>
        </template>
        <template v-else-if="view === 'files'">
          <div class="eyebrow">YOUR LOCAL LIBRARY</div><h1 class="tool-heading">My files.</h1><p class="page-subtitle">Your inputs and results, kept on your own hardware. Showing the 100 most recent files.</p><UploadPanel @uploaded="uploaded"/>
          <label class="search"><Search :size="19"/><input v-model="query" placeholder="Search files…" aria-label="Search files"/></label><div class="file-list"><div v-for="file in filteredFiles" :key="file.id" class="file-row"><span class="file-icon"><FileIcon :size="20"/></span><div class="file-info"><strong>{{ file.name }}</strong><small>{{ bytes(file.bytes) }} · {{ file.tool }} · {{ date(file.createdAt) }}</small></div><a :href="`/api/files/${file.id}`" class="icon-button" :aria-label="`Download ${file.name}`"><ArrowDownToLine :size="18"/></a><button class="icon-button danger" :aria-label="`Delete ${file.name}`" @click="remove(file)"><Trash2 :size="17"/></button></div><div v-if="!filteredFiles.length" class="empty">No files yet.</div></div>
        </template>
        <template v-else-if="view === 'jobs'"><div class="eyebrow">JOBS / PROGRESS / RESULTS</div><h1 class="tool-heading">A little less waiting.</h1><p class="page-subtitle">Follow your tasks, cancel work you no longer need, and download the results.</p><JobsPanel :jobs="jobs" :connected="connected" @refresh="refreshJobs"/></template>
        <template v-else><div class="eyebrow">BUILT AROUND YOU</div><h1 class="tool-heading">One workspace. Your hardware.</h1><p class="page-subtitle">Nexus brings mature open-source tools into a private, single-user workspace. This is a local preview, not a public multi-user service.</p><div class="about-panel"><h2>Privacy by design</h2><p>Files and metadata stay in your server's data directory. No analytics, external processing APIs, or remote fonts.</p><h2>Processing tools</h2><p>Start Redis and configure NEXUS_REDIS_URL for queued tasks. Media conversion also needs FFmpeg and ffprobe. Missing services are shown explicitly on each tool.</p><h2>Before remote access</h2><p>Configure NEXUS_TOKEN, NEXUS_ORIGIN and HTTPS. Keep the data directory backed up. File parsers are bounded, but are not a sandbox for hostile public uploads.</p></div></template>
        <footer><span>Nexus<span class="footer-dot">/</span>Less friction. More doing.</span><span>Self-hosted & open source<Sparkles :size="13"/></span></footer>
      </main>
    </div>
  </div>
</template>
