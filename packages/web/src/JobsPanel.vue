<script setup lang="ts">
import { ref } from 'vue';
import { ArrowDownToLine, Check, Clock3, LoaderCircle, X } from 'lucide-vue-next';
import type { TaskJob } from '@nexus/shared';
import { api } from './api.ts';
const props = defineProps<{ jobs: TaskJob[]; connected: boolean }>();
const emit = defineEmits<{ refresh: [] }>();
const error = ref(''); const cancelling = ref('');
async function cancel(id: string) { cancelling.value = id; error.value = ''; try { await api(`/jobs/${id}/cancel`, { method: 'POST' }); emit('refresh'); } catch (failure) { error.value = (failure as Error).message; } finally { cancelling.value = ''; } }
</script>
<template>
  <div class="section-heading"><h2>Processing history</h2><span>{{ connected ? 'Live updates connected' : 'Reconnecting live updates…' }}</span></div>
  <p v-if="error" class="error" role="alert">{{ error }}</p>
  <div v-if="!props.jobs.length" class="empty-files"><Clock3 :size="28"/><h3>No tasks yet.</h3><p>Choose a processing tool and your first task will appear here.</p></div>
  <article v-for="job in jobs" :key="job.id" class="job-card">
    <div class="job-title"><LoaderCircle v-if="job.status === 'running'" class="spin" :size="19"/><Check v-else-if="job.status === 'completed'" :size="19"/><Clock3 v-else :size="19"/><strong>{{ job.tool }}</strong><span class="job-status" :class="job.status">{{ job.status }}</span></div>
    <p class="job-message">{{ job.message }}</p>
    <progress v-if="['pending', 'running'].includes(job.status)" :value="job.percent" max="100" :aria-label="`${job.tool} progress`"/>
    <div class="job-meta"><small>{{ new Date(job.createdAt).toLocaleString() }} · {{ job.id.slice(0, 8) }}</small><button v-if="['pending', 'running'].includes(job.status)" class="text-button" :disabled="cancelling === job.id" @click="cancel(job.id)"><X :size="14"/> Cancel task</button></div>
    <div v-if="job.output.length" class="job-outputs"><a v-for="file in job.output" :key="file.id" :href="`/api/files/${file.id}`"><ArrowDownToLine :size="15"/> {{ file.name }}</a></div>
  </article>
</template>
