// /api/chat
// AI support assistant for Rentletter. Powered by Anthropic Claude.
// Multi-layer safety stack:
//   1. Keyword filter — catches obvious off-topic + risky patterns before calling Claude
//   2. Topic classifier — cheap pre-flight Claude call to verify the question is about Rentletter
//   3. Knowledge-grounded answer — main Claude call with system prompt
//   4. Output filter — scans response for risky language and rewrites if needed

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../../lib/chatKnowledge.js';

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

function preFilterMessage(text) {
  const t = String(text || '').trim();
  if (!t) return { allow: false, reason: 'empty', response: 'Please type a question.' };

  // Off-topic — refuse politely without spending budget
  for (const re of OFF_TOPIC_PATTERNS) {
    if (re.test(t)) {
      return {
        allow: false,
        reason: 'off_topic',
        response: "I can only help with questions about Rentletter — pricing, how it works, the landlord dashboard, application numbers, etc. For general questions, try ChatGPT or Google.",
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
// Cheap second-pass check using Claude Haiku.
// Returns true if the question is about Rentletter, false otherwise.
async function isOnTopic(userMessage, conversationContext) {
  try {
    // Use Haiku for the cheap classifier (much cheaper than Sonnet for binary classification)
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      system: `You are a topic classifier. Your only job: decide if the user's question is about Rentletter — a Canadian rental application platform with tenant cover letters and a landlord screening dashboard.

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

Respond with EXACTLY one word: "YES" if the question is about Rentletter, or "NO" if it's off-topic. No other words. No punctuation.`,
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
function postFilterResponse(text) {
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

  return t;
}

// ─── HANDLER ──────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[chat] ANTHROPIC_API_KEY missing');
    return res.status(503).json({ error: 'Chat is temporarily unavailable.' });
  }

  const { messages } = req.body || {};

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
  const preCheck = preFilterMessage(userMessage);
  if (!preCheck.allow) {
    console.log(`[chat] Pre-filter blocked: reason=${preCheck.reason}, message=${userMessage.slice(0, 80)}`);
    return res.status(200).json({ reply: preCheck.response });
  }

  // ─── LAYER 2: Topic classifier ───────────────────────
  // Skip for very short clarifying messages or first message (greeting)
  const isShortReply = userMessage.length < 25;
  if (!isShortReply) {
    const onTopic = await isOnTopic(userMessage, cleanMessages);
    if (!onTopic) {
      console.log(`[chat] Classifier rejected as off-topic: ${userMessage.slice(0, 80)}`);
      return res.status(200).json({
        reply: "I can only help with questions about Rentletter — how it works, pricing, the landlord dashboard, application numbers, etc. For other questions, please try a general AI assistant like ChatGPT.",
      });
    }
  }

  // ─── LAYER 3: Main answer ────────────────────────────
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
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
    const safeText = postFilterResponse(rawText);

    return res.status(200).json({ reply: safeText });
  } catch (e) {
    console.error('[chat] Anthropic error:', e?.message || e);
    return res.status(500).json({ error: 'I\'m having trouble right now. Please email hello@rentletter.ca.' });
  }
}

