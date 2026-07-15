/**
 * HATEOAS link builders — Richardson Maturity Level 3.
 *
 * Every link carries href + method so clients never need to hardcode
 * URL patterns or HTTP verbs.
 */

const BASE = '/tickets';

/**
 * Full set of links for a single ticket resource.
 */
export function ticketLinks(id) {
  return {
    self:               { href: `${BASE}/${id}`,                   method: 'GET'    },
    update:             { href: `${BASE}/${id}`,                   method: 'PUT'    },
    delete:             { href: `${BASE}/${id}`,                   method: 'DELETE' },
    auto_classify:      { href: `${BASE}/${id}/auto-classify`,     method: 'POST'   },
    classification_log: { href: `${BASE}/${id}/classification-log`, method: 'GET'   },
    collection:         { href: BASE,                              method: 'GET'    },
  };
}

/**
 * Links for the ticket collection (list / create).
 */
export function collectionLinks() {
  return {
    self:   { href: BASE, method: 'GET'  },
    create: { href: BASE, method: 'POST' },
    import: { href: `${BASE}/import`, method: 'POST' },
  };
}

/**
 * Attach _links to a ticket object without mutating the original.
 */
export function withTicketLinks(ticket) {
  return { ...ticket, _links: ticketLinks(ticket.id) };
}

/**
 * Attach _links to every ticket in a list response.
 */
export function withCollectionLinks(tickets) {
  return {
    count: tickets.length,
    _links: collectionLinks(),
    tickets: tickets.map(withTicketLinks),
  };
}
