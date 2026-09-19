<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Check, ChevronRight, CircleHelp, File, Files, Grid2X2, LoaderCircle, LockKeyhole, QrCode, Search, ShieldCheck, Sparkles, Trash2, X } from 'lucide-vue-next';
import type { StoredFile, ToolDescriptor } from '@nexus/shared';
import { api } from './api.ts';
const view = ref('home');
const query = ref('');
const files = ref<StoredFile[]>([]);
const tools = ref<(ToolDescriptor & { available: boolean })[]>([]);
const loading = ref(true); const busy = ref(false); const error = ref(''); const authenticated = ref(false); const protectedMode = ref(false); const token = ref('');
const text = ref(''); const format = ref('png'); const size = ref(512); const correction = ref('M'); const result = ref<StoredFile>();
const filteredTools = computed(() => tools.value.filter(tool => `${tool.name} ${tool.description}`.toLowerCase().includes(query.value.toLowerCase())));
const filteredFiles = computed(() => files.value.filter(file => file.name.toLowerCase().includes(query.value.toLowerCase())));
const bytes = (value: number) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(1)} MB`;
const date = (value: string) => new Date(value).toLocaleString();
async function refresh() { const [library, catalog] = await Promise.all([api<{ files: StoredFile[] }>('/files'), api<{ tools: typeof tools.value }>('/tools')]); files.value = library.files; tools.value = catalog.tools; }
async function initialize() { loading.value = true; error.value = ''; try { const session = await api<{ authenticated: boolean; protected: boolean }>('/session'); authenticated.value = session.authenticated; protectedMode.value = session.protected; if (session.authenticated) await refresh(); } catch (e) { error.value = (e as Error).message; } finally { loading.value = false; } }
async function login() { busy.value = true; error.value = ''; try { await api('/session', { method: 'POST', body: JSON.stringify({ token: token.value }) }); token.value = ''; await initialize(); } catch (e) { error.value = (e as Error).message; } finally { busy.value = false; } }
function navigate(next: string) { view.value = next; error.value = ''; query.value = ''; }
async function generate() { busy.value = true; error.value = ''; try { const response = await api<{ files: StoredFile[] }>('/tools/qr/run', { method: 'POST', body: JSON.stringify({ text: text.value, format: format.value, size: size.value, correction: correction.value }) }); result.value = response.files[0]; await refresh(); } catch (e) { error.value = (e as Error).message; } finally { busy.value = false; } }
async function remove(file: StoredFile) { if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return; try { await api(`/files/${file.id}`, { method: 'DELETE' }); if (result.value?.id === file.id) result.value = undefined; await refresh(); } catch (e) { error.value = (e as Error).message; } }
onMounted(initialize);
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a class="brand" href="#" @click.prevent="navigate('home')"><span class="brand-mark">n</span><span>Nexus<span class="brand-dot">.</span></span></a>
      <div class="workspace-label">PERSONAL WORKSPACE</div>
      <nav aria-label="Main navigation">
        <button :class="{ active: view === 'home' || view === 'qr' }" @click="navigate('home')"><Grid2X2 :size="19"/> All tools <span class="nav-count">{{ tools.length }}</span></button>
        <button :class="{ active: view === 'files' }" @click="navigate('files')"><Files :size="19"/> My files <span class="nav-count">{{ files.length }}</span></button>
      </nav>
      <div class="sidebar-bottom"><div class="privacy-note"><ShieldCheck :size="20"/><div><strong>Yours. Always.</strong><p>Your files stay on your hardware.</p></div></div><button class="help-link" @click="navigate('about')"><CircleHelp :size="18"/> About this workspace <ArrowUpRight :size="15"/></button><div class="profile"><span class="avatar">N</span><div><strong>Personal workspace</strong><small>Self-hosted · single user</small></div><span class="online-dot"/></div></div>
    </aside>
    <div class="main-column">
      <header class="topbar"><div class="breadcrumb">Workspace <ChevronRight :size="14"/> <strong>{{ view === 'files' ? 'My files' : view === 'qr' ? 'QR generator' : view === 'about' ? 'About' : 'All tools' }}</strong></div><span class="private-badge"><LockKeyhole :size="13"/> {{ protectedMode ? 'Protected workspace' : 'Local workspace' }}</span></header>
      <main>
        <div v-if="error" class="error" role="alert"><span>{{ error }}</span><button aria-label="Dismiss error" @click="error = ''"><X :size="18"/></button></div>
        <div v-if="loading" class="empty"><LoaderCircle class="spin"/> Connecting to your workspace…</div>
        <form v-else-if="!authenticated" class="login-panel" @submit.prevent="login"><LockKeyhole :size="28"/><h1>Welcome to Nexus</h1><p>Enter your server's access token to unlock this workspace.</p><label for="token">Access token</label><input id="token" v-model="token" type="password" autocomplete="current-password" required/><button class="primary" :disabled="busy">{{ busy ? 'Signing in…' : 'Unlock workspace' }}</button></form>
        <template v-else-if="view === 'home'">
          <div class="eyebrow"><span class="online-dot"/> YOUR PRIVATE TOOLKIT</div>
          <div class="page-heading"><div><h1>Everyday tasks.<br><span>A simpler place.</span></h1><p>Small tools for the things you do every day.<br class="desktop-break"> No uploads to strangers. No unnecessary noise.</p></div><div class="heading-note"><ShieldCheck :size="18"/><span>On your hardware.<br>Under your control.</span></div></div>
          <label class="search"><Search :size="19"/><input v-model="query" placeholder="Find a tool…" aria-label="Find a tool"/><kbd>/</kbd></label>
          <div class="section-heading"><h2>Your tools</h2><span>{{ filteredTools.length }} available</span></div>
          <div class="tool-grid"><button v-for="tool in filteredTools" :key="tool.id" class="tool-card" @click="navigate(tool.id)"><div class="card-top"><span class="tool-icon"><QrCode :size="24"/></span><ArrowUpRight :size="18"/></div><h3>{{ tool.name }}</h3><p>{{ tool.description }}</p><div class="card-bottom"><span>{{ tool.category }}</span><span class="tool-status">Ready <span class="online-dot"/></span></div></button></div>
          <p v-if="!filteredTools.length" class="empty">No tools match your search.</p>
          <section class="recent-section"><div class="section-heading"><h2>Recent files</h2><button class="text-button" @click="navigate('files')">View all <ArrowUpRight :size="15"/></button></div><div v-if="!files.length" class="empty-files"><div class="empty-icon"><Files :size="25"/></div><h3>A clean start.</h3><p>Create your first QR code. Your results will appear here.</p><button class="text-button" @click="navigate('qr')">Open QR generator <ArrowUpRight :size="15"/></button></div><div v-else class="file-list"><div v-for="file in files.slice(0, 5)" :key="file.id" class="file-row"><span class="file-icon"><File :size="20"/></span><div class="file-info"><strong>{{ file.name }}</strong><small>{{ bytes(file.bytes) }} · {{ date(file.createdAt) }}</small></div><a :href="`/api/files/${file.id}`" class="icon-button" :aria-label="`Download ${file.name}`"><ArrowDownToLine :size="18"/></a></div></div></section>
        </template>
        <template v-else-if="view === 'qr'">
          <button class="back text-button" @click="navigate('home')"><ArrowLeft :size="16"/> All tools</button><div class="eyebrow">CREATE / QR CODE</div><h1 class="tool-heading">Make a connection.</h1><p class="page-subtitle">A link, a note, an idea. Turn it into a QR code.</p>
          <div class="editor-grid"><form class="editor-panel" @submit.prevent="generate"><label for="qr-text">Text or link</label><textarea id="qr-text" v-model="text" maxlength="2000" rows="6" placeholder="https://example.com or any text…" required/><small class="field-note">{{ text.length }} / 2,000 characters. Generated on your server.</small><div class="fields-row"><div><label for="format">File format</label><select id="format" v-model="format"><option value="png">PNG image</option><option value="svg">SVG vector</option></select></div><div><label for="size">Size</label><select id="size" v-model.number="size"><option :value="256">256 × 256</option><option :value="512">512 × 512</option><option :value="1024">1024 × 1024</option></select></div></div><details><summary>Advanced options</summary><label for="correction">Error correction</label><select id="correction" v-model="correction"><option value="L">Low</option><option value="M">Medium (recommended)</option><option value="Q">Quartile</option><option value="H">High</option></select></details><button class="primary" :disabled="busy || !text.trim()"><LoaderCircle v-if="busy" class="spin" :size="18"/><QrCode v-else :size="18"/>{{ busy ? 'Generating…' : 'Generate QR code' }}</button></form><div class="preview-panel"><div class="preview-label">OUTPUT PREVIEW</div><template v-if="result"><div class="qr-preview"><img v-if="result.mime === 'image/png'" :src="`/api/files/${result.id}?preview=1`" alt="Generated QR code"/><QrCode v-else :size="110"/></div><div class="success-label"><Check :size="16"/> Saved to your library</div><a class="primary" :href="`/api/files/${result.id}`"><ArrowDownToLine :size="17"/>Download {{ result.mime === 'image/png' ? 'PNG' : 'SVG' }}</a></template><div v-else class="preview-empty"><QrCode :size="72" :stroke-width="1"/><p>Your QR code will appear here</p><small>Ready when you are.</small></div></div></div>
        </template>
        <template v-else-if="view === 'files'"><div class="eyebrow">YOUR LOCAL LIBRARY</div><h1 class="tool-heading">My files.</h1><p class="page-subtitle">Your inputs and results, kept on your own hardware.</p><label class="search"><Search :size="19"/><input v-model="query" placeholder="Search files…" aria-label="Search files"/></label><div class="file-list"><div v-for="file in filteredFiles" :key="file.id" class="file-row"><span class="file-icon"><File :size="20"/></span><div class="file-info"><strong>{{ file.name }}</strong><small>{{ bytes(file.bytes) }} · {{ file.tool }} · {{ date(file.createdAt) }}</small></div><a :href="`/api/files/${file.id}`" class="icon-button" :aria-label="`Download ${file.name}`"><ArrowDownToLine :size="18"/></a><button class="icon-button danger" :aria-label="`Delete ${file.name}`" @click="remove(file)"><Trash2 :size="17"/></button></div><div v-if="!filteredFiles.length" class="empty">No files yet.</div></div></template>
        <template v-else><div class="eyebrow">BUILT AROUND YOU</div><h1 class="tool-heading">One workspace. Your hardware.</h1><p class="page-subtitle">Nexus brings mature open-source tools into a private, single-user workspace. This is a local preview, not a public multi-user service.</p><div class="about-panel"><h2>Privacy by design</h2><p>Files and metadata are stored in the server's data directory. There are no analytics, external processing APIs, or remote fonts.</p><h2>Before remote access</h2><p>Configure NEXUS_TOKEN, NEXUS_ORIGIN and HTTPS before exposing the server. Keep your data directory backed up.</p></div></template>
        <footer><span>Nexus <span class="footer-dot">/</span> Less friction. More doing.</span><span>Self-hosted & open source <Sparkles :size="13"/></span></footer>
      </main>
    </div>
  </div>
</template>
