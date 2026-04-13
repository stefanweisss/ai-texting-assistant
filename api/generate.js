const MAX_MESSAGE_LENGTH = 1000;
const MAX_CONTEXT_LENGTH = 500;
const OPENAI_TIMEOUT_MS = 15_000;

const SYSTEM_PROMPT = `You are a texting assistant. You help people reply to text messages they've received.

Given a message (and optional context), produce exactly 3 short reply suggestions.

Voice and tone:
- Sound like a real person texting — casual, natural, not performative
- Vary the three replies: one laid-back/casual, one warm/friendly, one concise/direct
- Match the energy of the incoming message — if it's chill, stay chill; if it's excited, match that
- Never sound like a chatbot, customer service rep, or AI assistant
- Do not use emojis unless the incoming message contains emojis
- Keep each reply under 25 words
- No filler phrases like "Sure thing!" or "Absolutely!" or "No worries!"
- Do not repeat or closely rephrase the original message

Output format:
- Respond with ONLY a JSON array of exactly 3 strings
- No markdown, no code fences, no labels, no explanation
- Example: ["reply one","reply two","reply three"]`;

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function validateInput(body) {
  const { message, context } = body;

  if (!message || typeof message !== "string") {
    return { error: "Missing or invalid 'message' field", status: 400 };
  }

  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    return { error: "'message' must not be empty", status: 400 };
  }
  if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
    return { error: `'message' exceeds ${MAX_MESSAGE_LENGTH} character limit`, status: 400 };
  }

  const trimmedContext = context != null ? String(context).trim() : "";
  if (trimmedContext.length > MAX_CONTEXT_LENGTH) {
    return { error: `'context' exceeds ${MAX_CONTEXT_LENGTH} character limit`, status: 400 };
  }

  return { message: trimmedMessage, context: trimmedContext };
}

function extractJsonArray(raw) {
  if (!raw || typeof raw !== "string") return null;

  let cleaned = raw.trim();

  // Strip markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Find the outermost array brackets
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function validateReplies(parsed) {
  if (!Array.isArray(parsed)) return null;

  const replies = parsed
    .filter((item) => typeof item === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return replies.length === 3 ? replies : null;
}

async function callOpenAI(apiKey, userContent) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.8,
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`OpenAI API error [${response.status}]:`, body);
      return { error: "Failed to get response from AI", status: 502 };
    }

    const data = await response.json();
    return { data };
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("OpenAI request timed out");
      return { error: "AI request timed out", status: 504 };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseBody(req);
  const input = validateInput(body);

  if (input.error) {
    return res.status(input.status).json({ error: input.error });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  const userContent = input.context
    ? `Context: ${input.context}\n\nMessage received: ${input.message}`
    : `Message received: ${input.message}`;

  try {
    const result = await callOpenAI(apiKey, userContent);

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    let raw = result.data.choices?.[0]?.message?.content;
    let replies = validateReplies(extractJsonArray(raw));

    if (!replies) {
      console.warn("First attempt unusable, retrying:", raw);
      const retry = await callOpenAI(apiKey, userContent);
      if (retry.error) {
        return res.status(retry.status).json({ error: retry.error });
      }
      raw = retry.data.choices?.[0]?.message?.content;
      replies = validateReplies(extractJsonArray(raw));
    }

    if (!replies) {
      console.error("Retry also failed:", raw);
      return res.status(502).json({ error: "Malformed AI response" });
    }

    return res.status(200).json({ replies });
  } catch (err) {
    console.error("Unexpected error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
