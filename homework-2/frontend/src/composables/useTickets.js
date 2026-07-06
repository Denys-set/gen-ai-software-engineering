import { ref } from 'vue';
import axios from 'axios';

// Base URL is configurable via env; defaults to the Vite dev proxy path.
const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const api = axios.create({ baseURL });

/**
 * Normalize an axios error into a readable message, preferring the API's
 * structured error body ({ error, message, details }).
 */
function toMessage(err) {
  const data = err?.response?.data;
  if (data?.message) {
    const details = Array.isArray(data.details)
      ? ' — ' + data.details.map((d) => `${d.field}: ${d.message}`).join('; ')
      : '';
    return data.message + details;
  }
  return err?.message || 'Request failed';
}

/**
 * useTickets — thin reactive wrapper around the support-ticket API.
 * Holds shared list state plus loading/error flags, and exposes one method
 * per backend endpoint.
 */
export function useTickets() {
  const tickets = ref([]);
  const count = ref(0);
  const loading = ref(false);
  const error = ref(null);

  async function fetchTickets(filters = {}) {
    loading.value = true;
    error.value = null;
    try {
      // Drop empty filter values so we don't send ?category= with no value.
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, v]) => v !== '' && v != null)
      );
      const { data } = await api.get('/tickets', { params });
      tickets.value = data.tickets;
      count.value = data.count;
      return data;
    } catch (err) {
      error.value = toMessage(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function getTicket(id) {
    const { data } = await api.get(`/tickets/${id}`);
    return data;
  }

  async function createTicket(payload, autoClassify = false) {
    const { data } = await api.post('/tickets', payload, {
      params: autoClassify ? { auto_classify: 'true' } : {},
    });
    return data;
  }

  async function updateTicket(id, patch) {
    const { data } = await api.put(`/tickets/${id}`, patch);
    return data;
  }

  async function deleteTicket(id) {
    await api.delete(`/tickets/${id}`);
  }

  async function autoClassify(id) {
    const { data } = await api.post(`/tickets/${id}/auto-classify`);
    return data;
  }

  async function getClassificationLog(id) {
    const { data } = await api.get(`/tickets/${id}/classification-log`);
    return data;
  }

  async function importFile(file) {
    const form = new FormData();
    form.append('file', file);
    // Do not throw on 400 — the import summary is still a useful payload.
    const { data } = await api.post('/tickets/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      validateStatus: (s) => s < 500,
    });
    return data;
  }

  return {
    // state
    tickets,
    count,
    loading,
    error,
    // actions
    fetchTickets,
    getTicket,
    createTicket,
    updateTicket,
    deleteTicket,
    autoClassify,
    getClassificationLog,
    importFile,
    toMessage,
  };
}
