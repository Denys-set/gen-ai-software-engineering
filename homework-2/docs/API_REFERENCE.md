# API Reference

Base URL: `http://localhost:3000`

All request bodies are `application/json`. All responses are `application/json`.  
Every successful response includes a `_links` object (HATEOAS — Richardson Level 3).

---

## Ticket model

```
{
  id                     string (UUID v4)         — server-generated
  customer_id            string (required)
  customer_email         string (valid email, required)
  customer_name          string (required)
  subject                string (1–200 chars, required)
  description            string (10–2000 chars, required)
  category               enum (default: "other")
  priority               enum (default: "medium")
  status                 enum (default: "new")
  assigned_to            string | null (default: null)
  tags                   string[] (default: [])
  metadata               object
    .source              enum (default: "api")
    .browser             string (default: "")
    .device_type         enum (default: "desktop")
  resolved_at            ISO 8601 datetime | null
  classification_confidence  number | null
  manually_overridden    boolean (default: false)
  created_at             ISO 8601 datetime — server-generated
  updated_at             ISO 8601 datetime — server-generated
  _links                 HATEOAS links object
}
```

### Enumerations

| Field | Allowed values |
|---|---|
| `category` | `account_access`, `technical_issue`, `billing_question`, `feature_request`, `bug_report`, `other` |
| `priority` | `urgent`, `high`, `medium`, `low` |
| `status` | `new`, `in_progress`, `waiting_customer`, `resolved`, `closed` |
| `metadata.source` | `web_form`, `email`, `api`, `chat`, `phone` |
| `metadata.device_type` | `desktop`, `mobile`, `tablet` |

---

## Endpoints

### `GET /health`

Health check.

```bash
curl http://localhost:3000/health
```

**Response 200**
```json
{ "status": "ok" }
```

---

### `POST /tickets`

Create a ticket. Append `?auto_classify=true` to run classification on creation.

```bash
curl -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "C1",
    "customer_email": "alice@example.com",
    "customer_name": "Alice",
    "subject": "Cannot login after password reset",
    "description": "I reset my password but keep getting locked out when trying to sign in."
  }'
```

With auto-classification:

```bash
curl -X POST "http://localhost:3000/tickets?auto_classify=true" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "C2",
    "customer_email": "bob@example.com",
    "customer_name": "Bob",
    "subject": "Production down critical error",
    "description": "Critical exception causing production down. Security team alerted."
  }'
```

**Response 201**
```json
{
  "id": "9aaa13c2-6e25-40ad-b0e0-2bfc95781369",
  "customer_id": "C2",
  "customer_email": "bob@example.com",
  "customer_name": "Bob",
  "subject": "Production down critical error",
  "description": "Critical exception causing production down. Security team alerted.",
  "category": "technical_issue",
  "priority": "urgent",
  "status": "new",
  "assigned_to": null,
  "tags": [],
  "metadata": { "source": "api", "browser": "", "device_type": "desktop" },
  "resolved_at": null,
  "classification_confidence": 0.58,
  "manually_overridden": false,
  "created_at": "2026-07-06T14:00:00.000Z",
  "updated_at": "2026-07-06T14:00:00.000Z",
  "_links": {
    "self":               { "href": "/tickets/9aaa13c2-...", "method": "GET" },
    "update":             { "href": "/tickets/9aaa13c2-...", "method": "PUT" },
    "delete":             { "href": "/tickets/9aaa13c2-...", "method": "DELETE" },
    "auto_classify":      { "href": "/tickets/9aaa13c2-.../auto-classify", "method": "POST" },
    "classification_log": { "href": "/tickets/9aaa13c2-.../classification-log", "method": "GET" },
    "collection":         { "href": "/tickets", "method": "GET" }
  }
}
```

**Response 422** (validation failure)
```json
{
  "error": "ValidationError",
  "message": "Ticket validation failed",
  "details": [
    { "row": null, "field": "customer_email", "message": "customer_email must be a valid email" }
  ]
}
```

---

### `GET /tickets`

List all tickets. Supports optional query filters.

| Query param | Type | Description |
|---|---|---|
| `category` | enum | Filter by category |
| `priority` | enum | Filter by priority |
| `status` | enum | Filter by status |
| `assigned_to` | string | Filter by assigned agent |

```bash
# All tickets
curl http://localhost:3000/tickets

# Filter examples
curl "http://localhost:3000/tickets?status=new"
curl "http://localhost:3000/tickets?category=technical_issue&priority=urgent"
curl "http://localhost:3000/tickets?assigned_to=agent-007"
```

**Response 200**
```json
{
  "count": 2,
  "_links": {
    "self":   { "href": "/tickets", "method": "GET" },
    "create": { "href": "/tickets", "method": "POST" },
    "import": { "href": "/tickets/import", "method": "POST" }
  },
  "tickets": [
    { "id": "...", "subject": "...", "_links": { ... } }
  ]
}
```

---

### `GET /tickets/:id`

Fetch a single ticket by ID.

```bash
curl http://localhost:3000/tickets/9aaa13c2-6e25-40ad-b0e0-2bfc95781369
```

**Response 200** — full ticket object with `_links`

**Response 404**
```json
{
  "error": "NotFoundError",
  "message": "Ticket 9aaa13c2-... not found"
}
```

---

### `PUT /tickets/:id`

Update a ticket. At least one field required. Setting `category` or `priority` marks the ticket as `manually_overridden: true` and writes a `manual_override` entry to the classification log.

```bash
# Status update (does NOT set manually_overridden)
curl -X PUT http://localhost:3000/tickets/9aaa13c2-... \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "assigned_to": "agent-007"}'

# Manual category/priority override (sets manually_overridden: true)
curl -X PUT http://localhost:3000/tickets/9aaa13c2-... \
  -H "Content-Type: application/json" \
  -d '{"category": "bug_report", "priority": "high"}'
```

**Response 200** — updated ticket with `_links`

**Response 422** — invalid field value  
**Response 404** — ticket not found

---

### `DELETE /tickets/:id`

Delete a ticket.

```bash
curl -X DELETE http://localhost:3000/tickets/9aaa13c2-...
```

**Response 204** — no body

**Response 404** — ticket not found

---

### `POST /tickets/:id/auto-classify`

Run the rule-based classifier on an existing ticket. Updates the ticket's `category`, `priority`, and `classification_confidence`. Resets `manually_overridden` to `false`. Appends an `auto` entry to the classification log.

```bash
curl -X POST http://localhost:3000/tickets/9aaa13c2-.../auto-classify
```

**Response 200**
```json
{
  "category": "technical_issue",
  "priority": "urgent",
  "confidence": 0.58,
  "reasoning": "Category \"technical_issue\" matched 2 keyword(s): [error, exception]. Priority \"urgent\" triggered by keyword(s): [critical, production down].",
  "keywords_found": ["error", "exception", "critical", "production down"],
  "_links": {
    "self":               { "href": "/tickets/9aaa13c2-...", "method": "GET" },
    "update":             { "href": "/tickets/9aaa13c2-...", "method": "PUT" },
    "delete":             { "href": "/tickets/9aaa13c2-...", "method": "DELETE" },
    "auto_classify":      { "href": "/tickets/9aaa13c2-.../auto-classify", "method": "POST" },
    "classification_log": { "href": "/tickets/9aaa13c2-.../classification-log", "method": "GET" },
    "collection":         { "href": "/tickets", "method": "GET" }
  }
}
```

**Response 404** — ticket not found

---

### `GET /tickets/:id/classification-log`

Retrieve the full classification history for a ticket (auto and manual events).

```bash
curl http://localhost:3000/tickets/9aaa13c2-.../classification-log
```

**Response 200**
```json
{
  "ticket_id": "9aaa13c2-...",
  "count": 2,
  "log": [
    {
      "ticket_id": "9aaa13c2-...",
      "timestamp": "2026-07-06T14:00:00.000Z",
      "source": "auto",
      "inputs": {
        "subject": "Production down critical error",
        "description": "Critical exception causing production down."
      },
      "result": {
        "category": "technical_issue",
        "priority": "urgent",
        "confidence": 0.58,
        "reasoning": "...",
        "keywords_found": ["error", "exception", "critical", "production down"]
      }
    },
    {
      "ticket_id": "9aaa13c2-...",
      "timestamp": "2026-07-06T14:05:00.000Z",
      "source": "manual_override",
      "inputs": { "subject": "...", "description": "..." },
      "result": {
        "category": "bug_report",
        "priority": "high",
        "confidence": null,
        "reasoning": "Manual override via PUT request.",
        "keywords_found": []
      }
    }
  ],
  "_links": { ... }
}
```

**Response 404** — ticket not found

---

### `POST /tickets/import`

Bulk-import tickets from a file. Supports CSV, JSON, and XML. Partial-success semantics: valid rows are saved even when others fail.

**File size limit:** 5 MB

```bash
# CSV import
curl -X POST http://localhost:3000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.csv"

# JSON import
curl -X POST http://localhost:3000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.json"

# XML import
curl -X POST http://localhost:3000/tickets/import \
  -F "file=@tests/fixtures/sample_tickets.xml"
```

**CSV column layout:** `customer_id, customer_email, customer_name, subject, description, category, priority, tags, metadata.source, metadata.browser, metadata.device_type`  
Tags: semicolon or pipe separated (`tag1;tag2` or `tag1|tag2`).

**JSON format:** top-level array `[{...}]` or `{ "tickets": [{...}] }`.

**XML format:**
```xml
<tickets>
  <ticket>
    <customer_id>C1</customer_id>
    <customer_email>a@b.com</customer_email>
    ...
  </ticket>
</tickets>
```

**Response 201** (at least one row succeeded)
```json
{
  "format": "csv",
  "total": 50,
  "successful": 49,
  "failed": 1,
  "errors": [
    { "row": 12, "field": "customer_email", "message": "customer_email must be a valid email" }
  ],
  "tickets": [ { "id": "...", "_links": { ... } } ],
  "_links": {
    "collection": { "href": "/tickets", "method": "GET" },
    "import":     { "href": "/tickets/import", "method": "POST" }
  }
}
```

**Response 400** (all rows failed, no file, unsupported format, or file > 5 MB)

---

## Error response format

All errors follow the same shape:

```json
{
  "error": "ErrorClassName",
  "message": "Human-readable description",
  "details": [ ... ]
}
```

| HTTP status | `error` value | When |
|---|---|---|
| 400 | `BadRequestError` | Missing file, unsupported format, malformed file |
| 400 | `UploadError` | File exceeds 5 MB (multer) |
| 404 | `NotFoundError` | Ticket ID not found |
| 404 | `Not Found` | Unregistered route |
| 422 | `ValidationError` | Schema validation failed (includes `details` array) |
| 500 | `InternalServerError` | Unexpected server error |

The `details` array (present on 422 only) contains objects with `{ row, field, message }`.
