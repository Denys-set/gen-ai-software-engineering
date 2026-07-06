/**
 * In-memory ticket repository.
 *
 * Backed by a Map keyed by ticket id. Isolated behind this module so it can be
 * swapped for a real database later without touching the service layer.
 */
const store = new Map();

export const ticketRepository = {
  create(ticket) {
    store.set(ticket.id, ticket);
    return ticket;
  },

  findById(id) {
    return store.get(id) ?? null;
  },

  findAll(filters = {}) {
    let items = Array.from(store.values());

    const { category, priority, status, assigned_to } = filters;
    if (category) items = items.filter((t) => t.category === category);
    if (priority) items = items.filter((t) => t.priority === priority);
    if (status) items = items.filter((t) => t.status === status);
    if (assigned_to) items = items.filter((t) => t.assigned_to === assigned_to);

    return items;
  },

  update(id, ticket) {
    store.set(id, ticket);
    return ticket;
  },

  delete(id) {
    return store.delete(id);
  },

  /** Test helper — wipe all tickets. */
  clear() {
    store.clear();
  },

  count() {
    return store.size;
  },
};
