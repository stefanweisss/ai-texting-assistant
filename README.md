# AI Texting Assistant

Minimal Vercel serverless API that suggests 3 natural text message replies using OpenAI.

## Endpoint

**POST** `/api/generate`

### Request Body

```json
{
  "message": "Hey, are you free this weekend?",
  "context": "From a close friend"
}
```

| Field     | Type   | Required | Max Length | Description                        |
|-----------|--------|----------|------------|------------------------------------|
| `message` | string | yes      | 1000 chars | The text message you received      |
| `context` | string | no       | 500 chars  | Optional context about the conversation |

### Success Response (200)

```json
{
  "replies": [
    "Yeah I think so, what were you thinking?",
    "This weekend could work! What's the plan?",
    "Depends on the day — what's up?"
  ]
}
```

### Error Responses

| Status | Meaning                  | Example                                          |
|--------|--------------------------|--------------------------------------------------|
| 400    | Bad input                | `{"error": "Missing or invalid 'message' field"}` |
| 405    | Wrong HTTP method        | `{"error": "Method not allowed"}`                 |
| 500    | Server misconfiguration  | `{"error": "Server misconfiguration"}`            |
| 502    | AI returned bad output   | `{"error": "Malformed AI response"}`              |
| 504    | AI request timed out     | `{"error": "AI request timed out"}`               |

## Environment Variables

| Variable         | Required | Description          |
|------------------|----------|----------------------|
| `OPENAI_API_KEY` | yes      | Your OpenAI API key  |

## Local Development

```bash
cp .env.example .env.local    # then add your real key
npx vercel dev
```

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
3. Add `OPENAI_API_KEY` in **Settings > Environment Variables**
4. Deploy

Or via CLI:

```bash
npm i -g vercel
vercel login
vercel --prod
# then set OPENAI_API_KEY in the Vercel dashboard
```

## Test with curl

```bash
# Basic request
curl -X POST https://YOUR_PROJECT.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{"message": "Hey, are you free this weekend?"}'

# With context
curl -X POST https://YOUR_PROJECT.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{"message": "Can you cover my shift tomorrow?", "context": "From a coworker I get along with"}'

# Should return 400
curl -X POST https://YOUR_PROJECT.vercel.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{}'

# Should return 405
curl https://YOUR_PROJECT.vercel.app/api/generate
```

## Known Limitations

- No rate limiting — anyone with the URL can call it freely
- CORS allows all origins (`*`)
- No retry if the model returns malformed output
- Single region (Vercel default)

## Next Improvements

1. Rate limiting with Upstash Redis or Vercel KV
2. Lock CORS to your frontend domain
3. Retry once on malformed model output before returning 502
4. Add a simple frontend or iOS Shortcut to call the API
