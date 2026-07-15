<script setup>
import { reactive, watch } from 'vue';
import { CATEGORIES, PRIORITIES, STATUSES, humanize } from '../constants.js';

const emit = defineEmits(['change']);

const filters = reactive({ category: '', priority: '', status: '' });

// Emit whenever any filter changes so the parent can refetch.
watch(filters, () => emit('change', { ...filters }), { deep: true });

function reset() {
  filters.category = '';
  filters.priority = '';
  filters.status = '';
}
</script>

<template>
  <div class="card">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <label class="label">Category</label>
        <select v-model="filters.category" class="select">
          <option value="">All categories</option>
          <option v-for="c in CATEGORIES" :key="c" :value="c">{{ humanize(c) }}</option>
        </select>
      </div>
      <div>
        <label class="label">Priority</label>
        <select v-model="filters.priority" class="select">
          <option value="">All priorities</option>
          <option v-for="p in PRIORITIES" :key="p" :value="p">{{ humanize(p) }}</option>
        </select>
      </div>
      <div>
        <label class="label">Status</label>
        <select v-model="filters.status" class="select">
          <option value="">All statuses</option>
          <option v-for="s in STATUSES" :key="s" :value="s">{{ humanize(s) }}</option>
        </select>
      </div>
    </div>
    <div class="mt-3 flex justify-end">
      <button class="btn-ghost" @click="reset">Clear filters</button>
    </div>
  </div>
</template>
