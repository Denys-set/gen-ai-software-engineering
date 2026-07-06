<script setup>
import { ref, onMounted } from 'vue';
import { useTickets } from './composables/useTickets.js';
import TicketFilters from './components/TicketFilters.vue';
import TicketList from './components/TicketList.vue';
import CreateTicketForm from './components/CreateTicketForm.vue';
import ImportPanel from './components/ImportPanel.vue';
import TicketDetail from './components/TicketDetail.vue';

const { tickets, count, loading, error, fetchTickets } = useTickets();

const activeFilters = ref({});
const selectedId = ref(null);
const showCreate = ref(false);
const showImport = ref(false);

function refresh() {
  fetchTickets(activeFilters.value);
}

function onFilterChange(filters) {
  activeFilters.value = filters;
  refresh();
}

function onCreated() {
  showCreate.value = false;
  refresh();
}

function onImported() {
  refresh();
}

onMounted(refresh);
</script>

<template>
  <div class="min-h-screen">
    <!-- Header -->
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <div>
          <h1 class="text-lg font-semibold text-slate-800">🎧 Support Ticket Dashboard</h1>
          <p class="text-xs text-slate-500">Manage, classify, and import support tickets</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-ghost" @click="showImport = !showImport; showCreate = false">
            Import
          </button>
          <button class="btn-primary" @click="showCreate = !showCreate; showImport = false">
            + New ticket
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6">
      <!-- Panels -->
      <div v-if="showCreate" class="mb-6">
        <CreateTicketForm @created="onCreated" @close="showCreate = false" />
      </div>
      <div v-if="showImport" class="mb-6">
        <ImportPanel @imported="onImported" @close="showImport = false" />
      </div>

      <p v-if="error" class="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        {{ error }}
      </p>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <!-- Left: filters + list -->
        <div class="space-y-6 lg:col-span-2">
          <TicketFilters @change="onFilterChange" />
          <TicketList
            :tickets="tickets"
            :count="count"
            :loading="loading"
            @select="selectedId = $event"
          />
        </div>

        <!-- Right: detail -->
        <div class="lg:col-span-1">
          <TicketDetail
            v-if="selectedId"
            :ticket-id="selectedId"
            @close="selectedId = null"
            @changed="refresh"
          />
          <div v-else class="card text-center text-sm text-slate-400">
            Select a ticket to view details, classification, and the decision log.
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
