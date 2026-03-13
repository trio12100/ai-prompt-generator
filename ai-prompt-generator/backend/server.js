import express from "express"
import cors from "cors"
import axios from "axios"
import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

// Serve the Vite production build (used in production on Render)
const frontendDist = path.join(__dirname, "../frontend/dist")
app.use(express.static(frontendDist))

// Health check — Render uses this to confirm the service is up
app.get("/health", (_req, res) => res.json({ status: "ok" }))

const systemPrompts = {
  Writing: "You are an expert writing coach and creative director.",
  Coding: "You are a senior software engineer and technical mentor.",
  "Image Generation": "You are a master visual prompt designer specializing in AI image generation.",
  Study: "You are an elite tutor focused on clarity, memory retention, and active learning.",
  Marketing: "You are a growth strategist focused on persuasion, conversion, and brand voice.",
  Research: "You are a research analyst who prioritizes rigor, evidence, and synthesis.",
}

// POST /generate — take the full structured form data, call OpenAI, return an AI-enhanced prompt
app.post("/generate", async (req, res) => {
  const {
    type = "Writing",
    topic,
    tone = "clear",
    audience = "general audience",
    level = "Intermediate",
    format = "Markdown",
    length = "Medium",
    context = "",
    constraints = [],
    mustInclude = [],
    avoid = [],
    includeExamples = true,
    includeSteps = true,
    includeChecklist = false,
    includeQuestions = false,
    clientPrompt = "",
  } = req.body

  if (!topic && !clientPrompt) {
    return res.status(400).json({ error: "topic is required" })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return res.status(503).json({ error: "OpenAI API key not configured on server." })
  }

  // Build the meta-prompt that asks GPT to return an enhanced prompt
  const userMessage = clientPrompt || buildUserMessage({
    type, topic, tone, audience, level, format, length, context,
    constraints, mustInclude, avoid,
    includeExamples, includeSteps, includeChecklist, includeQuestions,
  })

  const systemContent =
    (systemPrompts[type] || systemPrompts.Writing) +
    "\n\nYour job is to take the user's intent and RETURN ONLY a single, polished, ready-to-use AI prompt — no commentary, no preamble, no markdown fences. Just the prompt text itself."

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userMessage },
        ],
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 30000,
      }
    )

    const enhanced = response.data.choices[0].message.content.trim()
    res.json({ prompt: enhanced, tokens: response.data.usage })
  } catch (err) {
    const status = err.response?.status
    const detail = err.response?.data?.error?.message || err.message
    res.status(status || 500).json({ error: detail || "Upstream API error" })
  }
})

// SPA fallback — serve index.html for any unknown route (client-side routing)
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"))
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUserMessage(opts) {
  const {
    type, topic, tone, audience, level, format, length, context,
    constraints, mustInclude, avoid,
    includeExamples, includeSteps, includeChecklist, includeQuestions,
  } = opts

  const lines = [
    `Create a ${tone} ${type} prompt about: "${topic}"`,
    `Target audience: ${audience}`,
    `Complexity: ${level}`,
    `Desired output format: ${format}`,
    `Desired response length: ${length}`,
  ]

  if (context) lines.push(`Background context: ${context}`)
  if (constraints.length) lines.push(`Constraints:\n${constraints.map(c => `- ${c}`).join("\n")}`)
  if (mustInclude.length) lines.push(`Must include:\n${mustInclude.map(m => `- ${m}`).join("\n")}`)
  if (avoid.length) lines.push(`Avoid:\n${avoid.map(a => `- ${a}`).join("\n")}`)

  const flags = []
  if (includeQuestions) flags.push("ask clarifying questions before answering")
  if (includeSteps) flags.push("include a step-by-step plan")
  if (includeExamples) flags.push("include concrete examples")
  if (includeChecklist) flags.push("end with a quality checklist")
  if (flags.length) lines.push(`The prompt should instruct the AI to: ${flags.join(", ")}.`)

  return lines.join("\n")
}
