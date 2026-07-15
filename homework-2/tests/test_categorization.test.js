import { classify, CLASSIFICATION_CONFIG } from '../src/services/classificationService.js';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ticketRepository } from '../src/repository/ticketRepository.js';

const app = createApp();
beforeEach(() => ticketRepository.clear());

// ─── classify() unit tests ─────────────────────────────────────────────────
describe('classify() — category rules', () => {
  it('assigns account_access for login/password/locked out keywords', () => {
    const r = classify('Cannot login', 'I forgot my password and am now locked out of my account');
    expect(r.category).toBe('account_access');
    expect(r.keywords_found).toEqual(expect.arrayContaining(['login', 'password', 'locked out']));
  });

  it('assigns technical_issue for error/crash/broken keywords', () => {
    const r = classify('App crash on startup', 'I keep getting an error when the app is broken and throws an exception');
    expect(r.category).toBe('technical_issue');
    expect(r.keywords_found).toEqual(expect.arrayContaining(['crash', 'error', 'broken', 'exception']));
  });

  it('assigns billing_question for payment/invoice/refund keywords', () => {
    const r = classify('Invoice missing', 'I need a refund for the charge on my subscription payment');
    expect(r.category).toBe('billing_question');
    expect(r.keywords_found).toEqual(expect.arrayContaining(['invoice', 'refund', 'charge', 'subscription', 'payment']));
  });

  it('assigns feature_request for suggestion/enhancement/would be nice keywords', () => {
    const r = classify('Would be nice to have dark mode', 'Please add this enhancement, I have a suggestion for the UI');
    expect(r.category).toBe('feature_request');
    expect(r.keywords_found).toEqual(expect.arrayContaining(['would be nice', 'enhancement', 'suggestion']));
  });

  it('assigns bug_report for bug/reproduce/unexpected behavior keywords', () => {
    const r = classify('Bug in search', 'Steps to reproduce: search for item, see unexpected behavior and data loss');
    expect(r.category).toBe('bug_report');
    expect(r.keywords_found).toEqual(expect.arrayContaining(['bug', 'reproduce', 'steps', 'unexpected behavior']));
  });

  it('falls back to other when no category keyword matches', () => {
    const r = classify('General inquiry', 'I would like to know more about your services and what is included');
    expect(r.category).toBe('other');
    expect(r.confidence).toBe(0);
  });
});

describe('classify() — priority rules', () => {
  it('assigns urgent for critical/production down/security keywords', () => {
    const r = classify('Critical error', 'This is a critical security issue causing production down');
    expect(r.priority).toBe('urgent');
    expect(r.keywords_found).toEqual(expect.arrayContaining(['critical', 'security', 'production down']));
  });

  it("assigns urgent for can't access keyword", () => {
    const r = classify("Cannot use app", "I can't access any of my files since this morning");
    expect(r.priority).toBe('urgent');
  });

  it('assigns high for important/blocking/asap keywords', () => {
    const r = classify('Blocking issue', 'This is important and blocking our release, please fix asap');
    expect(r.priority).toBe('high');
    expect(r.keywords_found).toEqual(expect.arrayContaining(['blocking', 'important', 'asap']));
  });

  it('assigns low for minor/cosmetic/suggestion keywords', () => {
    const r = classify('Minor issue', 'This is a minor cosmetic problem, just a suggestion for improvement');
    expect(r.priority).toBe('low');
    expect(r.keywords_found).toEqual(expect.arrayContaining(['minor', 'cosmetic', 'suggestion']));
  });

  it('defaults to medium when no priority keyword matches', () => {
    const r = classify('General inquiry', 'I would like to learn more about the platform features available');
    expect(r.priority).toBe('medium');
  });

  it('urgent beats high when both are present', () => {
    const r = classify('Critical and important blocking', 'This is critical and also very important, blocking asap');
    expect(r.priority).toBe('urgent');
  });
});

describe('classify() — confidence formula', () => {
  it('confidence is 0 when nothing matches', () => {
    const r = classify('Hello there', 'I have a question about your service offerings');
    expect(r.confidence).toBe(0);
  });

  it('confidence is correct for category-only match (no priority)', () => {
    // billing_question: payment, invoice, refund, charge, subscription = 5 keywords
    // match all 5 → category_score = 1.0, priority_score = 0 → confidence = 0.7
    const r = classify(
      'Payment invoice refund charge subscription',
      'I need help with payment invoice refund charge subscription issues'
    );
    expect(r.category).toBe('billing_question');
    expect(r.priority).toBe('medium');
    expect(r.confidence).toBeCloseTo(0.7, 2);
  });

  it('confidence is correct for category + priority match', () => {
    // technical_issue: error, crash (2/5 = 0.4), + urgent priority hit → 0.4*0.7 + 1*0.3 = 0.58
    const r = classify('Critical error and crash', 'Getting an error and crash, critical issue here');
    expect(r.category).toBe('technical_issue');
    expect(r.priority).toBe('urgent');
    expect(r.confidence).toBeCloseTo(0.58, 2);
  });

  it('confidence is between 0 and 1', () => {
    const inputs = [
      ['login crash', 'error password broken exception'],
      ['refund', 'payment'],
      ['general', 'no keywords here at all please'],
    ];
    for (const [s, d] of inputs) {
      const r = classify(s, d);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('reasoning string describes the matched keywords', () => {
    const r = classify('Cannot login', 'Locked out of account with password issue');
    expect(r.reasoning).toContain('account_access');
    expect(r.reasoning).toMatch(/keyword/i);
  });
});

describe('classify() — case insensitivity', () => {
  it('matches keywords in all-caps subject and description', () => {
    const r = classify('CANNOT LOGIN LOCKED OUT', 'APP IS BROKEN THROWING ERRORS AND EXCEPTIONS');
    expect(['account_access', 'technical_issue']).toContain(r.category);
    expect(r.keywords_found.length).toBeGreaterThan(0);
  });
});

describe('CLASSIFICATION_CONFIG', () => {
  it('has all required category keys', () => {
    const cats = Object.keys(CLASSIFICATION_CONFIG.categories);
    expect(cats).toEqual(expect.arrayContaining([
      'account_access', 'technical_issue', 'billing_question', 'feature_request', 'bug_report',
    ]));
  });

  it('has all required priority keys', () => {
    const pris = Object.keys(CLASSIFICATION_CONFIG.priorities);
    expect(pris).toEqual(expect.arrayContaining(['urgent', 'high', 'low']));
  });

  it('every category has at least one keyword', () => {
    for (const [cat, keywords] of Object.entries(CLASSIFICATION_CONFIG.categories)) {
      expect(keywords.length).toBeGreaterThan(0);
    }
  });
});

// ─── HTTP integration — auto-classify endpoint ────────────────────────────
describe('POST /tickets/:id/auto-classify — integration', () => {
  const BASE = {
    customer_id: 'T1',
    customer_email: 't@test.com',
    customer_name: 'Tester',
    subject: 'Cannot access account',
    description: 'I am locked out and cannot sign in with my password or 2fa code',
  };

  it('response includes all required classification fields', async () => {
    const created = await request(app).post('/tickets').send(BASE);
    const res = await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    expect(res.status).toBe(200);
    expect(typeof res.body.category).toBe('string');
    expect(typeof res.body.priority).toBe('string');
    expect(typeof res.body.confidence).toBe('number');
    expect(typeof res.body.reasoning).toBe('string');
    expect(Array.isArray(res.body.keywords_found)).toBe(true);
  });

  it('re-classifying resets manually_overridden to false', async () => {
    const created = await request(app).post('/tickets').send(BASE);
    await request(app).put(`/tickets/${created.body.id}`).send({ category: 'billing_question' });
    let t = await request(app).get(`/tickets/${created.body.id}`);
    expect(t.body.manually_overridden).toBe(true);

    await request(app).post(`/tickets/${created.body.id}/auto-classify`);
    t = await request(app).get(`/tickets/${created.body.id}`);
    expect(t.body.manually_overridden).toBe(false);
  });
});
