// /api/chat
// AI support assistant for Rentletter. Powered by Anthropic Claude.
// Multi-layer safety stack:
//   1. Keyword filter — catches obvious off-topic + risky patterns before calling Claude
//   2. Topic classifier — cheap pre-flight Claude call to verify the question is about Rentletter
//   3. Knowledge-grounded answer — main Claude call with system prompt
//   4. Output filter — scans response for risky language and rewrites if needed

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, DASHBOARD_SYSTEM_PROMPT } from '../../lib/chatKnowledge.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const rateLimits = new Map();
const MAX_MESSAGES_PER_HOUR_PER_IP = 50;
const MAX_MESSAGES_PER_CONVERSATION = 20;

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// ─── LAYER 1: KEYWORD FILTERS ─────────────────────────────────
// Catch obvious patterns before spending a Claude call.

// Off-topic patterns. If matched, refuse without calling Claude.
const OFF_TOPIC_PATTERNS = [
  // Code requests
  /\b(write|generate|fix|debug|review|explain) (me )?(some |a |the )?(code|function|script|program|app)\b/i,
  /\bpython|javascript|typescript|react|node\.?js|html|css|sql|rust|golang|java\b.*\b(code|how|tutorial)\b/i,
  /\bcompile|stack trace|syntax error|null pointer\b/i,
  // Homework / essays / creative writing
  /\bwrite (me )?(an? |the )?(essay|poem|story|article|blog|paragraph|haiku|joke|rap|song)\b/i,
  /\bhomework|assignment|thesis|dissertation\b/i,
  /\btranslate (this )?(to|into|from)\b/i,
  // General knowledge
  /\b(who|what|when|where|why|how) (is|are|was|were) (the (capital|president|prime minister)|.*history of|.*invented)\b/i,
  /\b(weather|forecast|temperature) (in|for|today)\b/i,
  /\b(recipe|cook|how to make) (a |the )?(cake|chicken|pasta|pizza|bread|cookie)/i,
  // Math
  /^\s*[\d+\-*/()=. ]{8,}\s*$/,
  /\b(solve|calculate|compute|integral|derivative|equation)\b.*\b(for|of|x|y|=)\b/i,
  // Personal
  /\b(what should I (eat|wear|do today|do tonight)|how do I get over|relationship advice)\b/i,
  // Other AI
  /\b(act as|pretend to be|roleplay as|you are now|ignore (your |the )?(previous |above )?(instructions|system))\b/i,
  /\b(jailbreak|prompt injection|system prompt|reveal your prompt)\b/i,
];

// Legal-advice patterns. If matched, give a canned legal refusal.
const LEGAL_ADVICE_PATTERNS = [
  /\bcan (i|my landlord|a landlord|the landlord) (legally |lawfully )?(reject|refuse|evict|kick out|raise|increase|enter|deny)\b/i,
  /\bis it legal\b/i,
  /\bis it illegal\b/i,
  /\bdiscriminat(e|ion|ory)\b/i,
  /\bhrto|human rights tribunal|ltb|landlord and tenant board\b/i,
  /\bsue|lawsuit|small claims|legal action|tribunal\b/i,
  /\bhuman rights code\b.*\b(violat|breach)\b/i,
  /\bmy rights as a (tenant|landlord)\b/i,
  /\bevict|eviction notice\b/i,
];

// Account-specific patterns. Route to email.
const ACCOUNT_PATTERNS = [
  /\b(refund|charge ?back|cancel my (account|subscription|payment))\b/i,
  /\bmy (application|account|payment|order|letter|rl[ -]?\d)\b/i,
  /\b(can('|no)?t find|lost|missing|where is) my (application|letter|email|number|receipt)\b/i,
  /\bdidn'?t (get|receive) my (letter|email|receipt|payment)\b/i,
  /\bRL-?\d{4}-?[A-Z0-9-]+/i,
];

// ─── DASHBOARD GUARDRAIL: tenant-selection advice ─────────────
// The dashboard assistant is a HOW-TO guide, never a screening advisor. These patterns catch
// "who should I pick / is this tenant good / should I approve X" and refuse deterministically
// (before spending a Claude call), redirecting to "I can explain HOW the ranking works". The
// system prompt enforces the same; this is the code-level backstop.
const SELECTION_ADVICE_PATTERNS = [
  /\bwho (should|do|would|ought) (i|we|you)\b[^?]*\b(pick|choose|select|go with|rent to|approve|accept|reject|shortlist|prefer|take)\b/i,
  /\b(which|what) (applicant|tenant|candidate|one|person|renter)\b[^?]*\b(should|is|are|do you|would you|best|better|strongest|worst|good|pick|choose|recommend|prefer|go with)\b/i,
  /\bshould i (pick|choose|select|go with|rent to|approve|accept|reject|shortlist|prefer|take)\b/i,
  /\b(is|are) (this|that|the) (applicant|tenant|candidate|person|renter)\b[^?]*\b(good|bad|risky|trustworthy|reliable|worth|a good (fit|choice|tenant|applicant)|the best|the right|strong|weak)\b/i,
  /\bis (he|she|they)\b[^?]*\b(a )?(good|bad|risky|trustworthy|reliable|worth|the best|the right|a good (fit|tenant|choice|applicant))\b/i,
  /\b(who|which)(?:'s|’s| is| are)? the (best|top|strongest|right|worst) (applicant|tenant|candidate|pick|choice|fit)\b/i,
  /\bdo you (recommend|think|suggest|reckon)\b[^?]*\b(pick|choose|approve|accept|reject|prefer|go with|rent to)\b/i,
  /\b(recommend|suggest|tell me|pick|choose)\b[^?]*\b(which|who|the best|the top|the strongest) (applicant|tenant|candidate|one)\b/i,
];

// Exact decline + redirect used whenever selection advice is requested (pre- and post-filter).
const DASHBOARD_SELECTION_DECLINE =
  "That's your professional judgment as the realtor — I can't recommend or endorse which applicant to choose. What I can do is explain how the ranking is calculated (income, rent-to-income, employment tenure, rental history, and references) so you can interpret it and decide for yourself. Want me to walk through how a score is built?";

// Dashboard off-topic decline — the realtor's help assistant, NOT the marketing chat. No
// "landlord dashboard" wording, no "try ChatGPT" (off-brand for an in-product paid tool).
const DASHBOARD_OFF_TOPIC_DECLINE =
  "I'm here to help you use Rentletter — creating listings, ranking applicants, verifying documents, sending reports. For account issues, email info@rentletter.ca.";

// Product how-to vocabulary. In dashboard mode, if a question mentions any of this it's a
// legitimate product question and is treated as on-topic deterministically — so the probabilistic
// topic classifier can never false-refuse core how-to ("how do I create a listing", etc.).
// (Selection-advice was already declined earlier in the pre-filter, so these hints are safe here.)
const DASHBOARD_ONTOPIC_HINTS = /\b(listing|listings|invite|link|applicant|application|apply|tenant|rank|ranked|ranking|score|scorecard|scoring|set[ -]?aside|withdrew|withdrawn|verif|document|name[ -]?match|report|shortlist|landlord|notification|bell|preference|occupant|bedroom|rent|income|lease|guarantor|reference|employment|dashboard|listing detail|create|edit|delete|add|share|regenerate|confirm|how do i|how to|what does|what is|where (is|do|can)|set up|use)\b/i;

function preFilterMessage(text, mode = 'marketing') {
  const t = String(text || '').trim();
  if (!t) return { allow: false, reason: 'empty', response: 'Please type a question.' };

  // Dashboard only: refuse tenant-selection advice up front (the marketing chat never sees this).
  if (mode === 'dashboard') {
    for (const re of SELECTION_ADVICE_PATTERNS) {
      if (re.test(t)) {
        return { allow: false, reason: 'selection_advice', response: DASHBOARD_SELECTION_DECLINE };
      }
    }
  }

  // Off-topic — refuse politely without spending budget. Dashboard mode uses its own,
  // in-product decline copy (never the marketing "landlord dashboard / try ChatGPT" line).
  for (const re of OFF_TOPIC_PATTERNS) {
    if (re.test(t)) {
      return {
        allow: false,
        reason: 'off_topic',
        response: mode === 'dashboard'
          ? DASHBOARD_OFF_TOPIC_DECLINE
          : "I can only help with questions about Rentletter — pricing, how it works, the landlord dashboard, application numbers, etc. For general questions, try ChatGPT or Google.",
      };
    }
  }

  // Legal advice — canned refusal
  for (const re of LEGAL_ADVICE_PATTERNS) {
    if (re.test(t)) {
      return {
        allow: false,
        reason: 'legal',
        response: "I can't give legal advice. For specific landlord-tenant questions in Ontario, contact the Landlord and Tenant Board (LTB) or consult a lawyer. The Human Rights Tribunal of Ontario (HRTO) handles discrimination complaints. For general info about how Rentletter helps with compliance, I'm happy to explain.",
      };
    }
  }

  // Account-specific — route to email
  for (const re of ACCOUNT_PATTERNS) {
    if (re.test(t)) {
      return {
        allow: false,
        reason: 'account',
        response: "For anything specific to your account — refunds, missing letters, application status, payment issues — please email hello@rentletter.ca and Armin will respond within 24 hours. I don't have access to individual accounts.",
      };
    }
  }

  return { allow: true };
}

// ─── LAYER 2: TOPIC CLASSIFIER ────────────────────────────────
// Cheap second-pass check using Claude Haiku. Returns true if the question is on-topic.

const MARKETING_CLASSIFIER_PROMPT = `You are a topic classifier. Your only job: decide if the user's question is about Rentletter — a Canadian rental application platform with tenant cover letters and a landlord screening dashboard.

ON-TOPIC examples:
- "How much does it cost?"
- "What's an RL number?"
- "How does the landlord dashboard work?"
- "Is my data private?"
- "Can I edit my application?"
- "What provinces are covered?"
- Anything about pricing, payment, signup, the form, the dashboard, RL numbers, landlords, tenants, screening, applications.

OFF-TOPIC examples:
- "Write me a Python function"
- "What's the weather in Toronto?"
- "Tell me about Canadian history"
- "Help me with my resume" (not a rentletter resume — a general resume)
- "What's 2+2?"
- "Recipe for pasta"
- "Write a poem"
- General trivia, coding, math, creative writing, personal advice not about renting.

Respond with EXACTLY one word: "YES" if the question is about Rentletter, or "NO" if it's off-topic. No other words. No punctuation.`;

// Dashboard classifier: on-topic = ANY question about USING Rentletter as a realtor (product
// how-to). Strongly biased to YES so real how-to questions are never refused; only genuinely
// unrelated requests get a NO.
const DASHBOARD_CLASSIFIER_PROMPT = `You are a topic classifier for the Rentletter REALTOR DASHBOARD help assistant. Decide if the user's question is about USING Rentletter as a realtor — how the product works and how to do things in it.

ON-TOPIC (YES) — anything about using Rentletter:
- "How do I create a listing?" / "How do I invite a tenant?" / "How do I get the invite link?"
- "How does the ranking work?" / "What does set-aside mean?" / "Difference between set-aside and withdrew?"
- "How do I verify a finalist?" / "What is the name-match?" / "How do I send the report to my landlord?"
- "How do notifications work?" / "How do I edit a listing?" / "What are the required fields?"
- Anything about listings, invite links, applicants, the ranked list, the score/factors, verification, documents, reports, notifications, preferences, compliance, or how to use any dashboard feature.

OFF-TOPIC (NO) — only things unrelated to Rentletter entirely:
- "Write me a Python function" / "What's the weather?" / "What's 2+2?" / "Recipe for pasta" / "Write a poem"
- General trivia, coding, math, creative writing, or personal advice unrelated to using Rentletter.

When unsure, answer YES (assume it's a product question). Respond with EXACTLY one word: "YES" or "NO". No other words. No punctuation.`;

async function isOnTopic(userMessage, mode = 'marketing') {
  // Dashboard: product how-to vocabulary is on-topic deterministically — never let the
  // probabilistic classifier false-refuse a core how-to question.
  if (mode === 'dashboard' && DASHBOARD_ONTOPIC_HINTS.test(userMessage)) return true;
  try {
    // Use Haiku for the cheap classifier (much cheaper than Sonnet for binary classification)
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      system: mode === 'dashboard' ? DASHBOARD_CLASSIFIER_PROMPT : MARKETING_CLASSIFIER_PROMPT,
      messages: [
        { role: 'user', content: `Question: "${userMessage.slice(0, 500)}"` },
      ],
    });

    const text = result.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .toUpperCase();

    return text.startsWith('YES');
  } catch (e) {
    console.error('[chat] Topic classifier error:', e?.message || e);
    // On classifier failure, default to allowing (don't punish users for our error)
    return true;
  }
}

// ─── LAYER 4: OUTPUT FILTER ───────────────────────────────────
// Scan Claude's response for risky language. Replace with safe response if matched.
function postFilterResponse(text, mode = 'marketing') {
  const t = String(text || '');

  // Patterns that indicate Claude slipped past its instructions
  const RISKY_OUTPUT_PATTERNS = [
    // Specific yes/no on legal questions
    /\byou (can|cannot|can't|may|may not|are allowed to|are not allowed to) (legally|lawfully)\b/i,
    /\bit (is|isn't|isn'?t) (legal|illegal|lawful|unlawful)\b/i,
    /\bI recommend that you (reject|refuse|approve|accept|evict|sue)\b/i,
    /\bbased on (the|your) (income|background|references), (I (think|believe)|you should) (reject|approve|accept)\b/i,
  ];

  for (const re of RISKY_OUTPUT_PATTERNS) {
    if (re.test(t)) {
      console.warn('[chat] Output filter caught risky pattern:', re);
      return "I can't give specific legal or decision advice for your situation. For general info about how Rentletter works, I can help. For specific cases, please consult a lawyer or contact the Landlord and Tenant Board.";
    }
  }

  // Dashboard only: catch any model slip that endorses picking/preferring an applicant.
  if (mode === 'dashboard') {
    const SELECTION_OUTPUT_PATTERNS = [
      /\b(you should|i(?:'d| would)?( strongly)? (recommend|suggest)|i think you should|my recommendation is to) (pick|choose|select|go with|rent to|approve|accept|reject|shortlist|prefer)\b/i,
      /\bthe (best|top|strongest|right|worst) (applicant|tenant|candidate|choice|pick|fit) (is|would be|here is|is probably)\b/i,
      /\b(applicant|tenant|candidate) \w+ is (the best|clearly better|a better|stronger than|the right|the strongest)\b/i,
    ];
    for (const re of SELECTION_OUTPUT_PATTERNS) {
      if (re.test(t)) {
        console.warn('[chat] Dashboard output filter caught selection-advice slip:', re);
        return DASHBOARD_SELECTION_DECLINE;
      }
    }
  }

  return t;
}

// ─── HANDLER ──────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[chat] ANTHROPIC_API_KEY missing');
    return res.status(503).json({ error: 'Chat is temporarily unavailable.' });
  }

  const { messages, mode: rawMode } = req.body || {};
  // 'dashboard' = the in-app realtor product-help assistant; anything else = the homepage
  // marketing assistant (default, unchanged). Only the system prompt (and, for dashboard, an
  // extra selection-advice guardrail) differ — the safety stack around them is shared.
  const mode = rawMode === 'dashboard' ? 'dashboard' : 'marketing';
  const systemPrompt = mode === 'dashboard' ? DASHBOARD_SYSTEM_PROMPT : SYSTEM_PROMPT;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array required.' });
  }

  if (messages.length > MAX_MESSAGES_PER_CONVERSATION) {
    return res.status(429).json({
      error: 'This conversation has gotten quite long. For continued help, please email hello@rentletter.ca.',
    });
  }

  // Rate limit by IP
  const ip = getClientIp(req);
  const now = Date.now();
  const recent = (rateLimits.get(ip) || []).filter(ts => now - ts < 60 * 60 * 1000);
  if (recent.length >= MAX_MESSAGES_PER_HOUR_PER_IP) {
    return res.status(429).json({
      error: 'You\'ve hit the chat limit for now. Please email hello@rentletter.ca instead.',
    });
  }
  recent.push(now);
  rateLimits.set(ip, recent);

  // Validate messages
  const cleanMessages = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, 2000);
    if (!content) continue;
    cleanMessages.push({ role: m.role, content });
  }

  if (cleanMessages.length === 0) {
    return res.status(400).json({ error: 'No valid messages provided.' });
  }
  if (cleanMessages[cleanMessages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Last message must be from user.' });
  }

  const userMessage = cleanMessages[cleanMessages.length - 1].content;

  // ─── LAYER 1: Pre-filter ─────────────────────────────
  const preCheck = preFilterMessage(userMessage, mode);
  if (!preCheck.allow) {
    console.log(`[chat] Pre-filter blocked: reason=${preCheck.reason}, message=${userMessage.slice(0, 80)}`);
    return res.status(200).json({ reply: preCheck.response });
  }

  // ─── LAYER 2: Topic classifier ───────────────────────
  // Skip for very short clarifying messages or first message (greeting)
  const isShortReply = userMessage.length < 25;
  if (!isShortReply) {
    const onTopic = await isOnTopic(userMessage, mode);
    if (!onTopic) {
      console.log(`[chat] Classifier rejected as off-topic (mode=${mode}): ${userMessage.slice(0, 80)}`);
      return res.status(200).json({
        reply: mode === 'dashboard'
          ? DASHBOARD_OFF_TOPIC_DECLINE
          : "I can only help with questions about Rentletter — how it works, pricing, the landlord dashboard, application numbers, etc. For other questions, please try a general AI assistant like ChatGPT.",
      });
    }
  }

  // ─── LAYER 3: Main answer ────────────────────────────
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      system: systemPrompt,
      messages: cleanMessages,
    });

    const rawText = message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n')
      .trim();

    if (!rawText) {
      return res.status(500).json({ error: 'No response from assistant. Please try again.' });
    }

    // ─── LAYER 4: Post-filter ──────────────────────────
    const safeText = postFilterResponse(rawText, mode);

    return res.status(200).json({ reply: safeText });
  } catch (e) {
    console.error('[chat] Anthropic error:', e?.message || e);
    return res.status(500).json({ error: 'I\'m having trouble right now. Please email hello@rentletter.ca.' });
  }
}

