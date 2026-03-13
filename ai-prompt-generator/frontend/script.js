// ── Config ──────────────────────────────────────────────────────────────────
const MAX_HISTORY = 12
const PRESET_KEY  = "promptforge-preset-v2"
const HISTORY_KEY = "promptforge-history-v1"
const DEFAULT_TEXT = "Your generated prompt will appear here…"

// ── Topic suggestions ────────────────────────────────────────────────────────
const topicSuggestions = {
  Writing: [
    "Write a compelling personal statement for grad school",
    "Create a weekly newsletter framework for a SaaS product",
    "Draft a blog post outline about productivity systems",
    "Write a short story opening using in medias res",
  ],
  Coding: [
    "Design a secure REST API with JWT auth",
    "Plan a migration from JavaScript to TypeScript",
    "Build a real-time dashboard with WebSockets",
    "Implement a rate-limiter middleware in Node.js",
  ],
  "Image Generation": [
    "Create a futuristic city skyline at golden hour",
    "Generate minimalist product hero concept art",
    "Render a cozy cabin in a misty forest",
    "Design an abstract logo for an AI startup",
  ],
  Study: [
    "Build a 4-week exam revision plan for calculus",
    "Explain recursion to a 12-year-old",
    "Create flashcard prompts for learning Spanish",
    "Summarise the key ideas of Stoic philosophy",
  ],
  Marketing: [
    "Plan a product launch campaign for a mobile app",
    "Create a landing page messaging strategy",
    "Write an email sequence for a new subscriber",
    "Develop a positioning statement for a fintech startup",
  ],
  Research: [
    "Compare transformer vs diffusion model architectures",
    "Design a user interview synthesis workflow",
    "Outline a competitive analysis framework",
    "Summarise recent advances in CRISPR gene editing",
  ],
}

// ── Prompt templates (for local build) ──────────────────────────────────────
const promptTemplates = {
  Writing: "You are an expert writing coach and creative director.",
  Coding: "You are a senior software engineer and technical mentor.",
  "Image Generation": "You are a master visual prompt designer for AI image generation.",
  Study: "You are an elite tutor focused on clarity, memory retention, and active learning.",
  Marketing: "You are a growth strategist focused on persuasion, conversion, and brand voice.",
  Research: "You are a research analyst who prioritises rigor, evidence, and synthesis.",
}

const formatGuidanceMap = {
  Markdown: "Use Markdown headings and concise sections.",
  "Bullet List": "Format the answer primarily as bulleted lists.",
  JSON: "Return a valid JSON object with clear keys.",
  Email: "Write in email format with a subject line and clear body.",
  Table: "Use a well-structured table wherever appropriate.",
  "Plain Text": "Use plain paragraphs with no special formatting.",
}

const lengthGuidanceMap = {
  Short: "Keep the output brief and high-signal.",
  Medium: "Provide balanced detail without unnecessary verbosity.",
  Long: "Provide deep detail, examples, and reasoning where useful.",
}

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  constraints: ["Be specific", "Use actionable language"],
  mustInclude: [],
  avoid: [],
}

let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]")

// ── DOM helpers ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)

function setLoading(isLoading) {
  $("loadingBar").classList.toggle("hidden", !isLoading)
  $("generateBtn").disabled = isLoading
}

function showToast(msg, isError = false) {
  const t = $("toast")
  t.textContent = msg
  t.className = "toast" + (isError ? " toast-error" : "")
  clearTimeout(t._timer)
  t._timer = setTimeout(() => { t.className = "toast hidden" }, 3000)
}

function updateStats(text) {
  const clean = text === DEFAULT_TEXT ? "" : text
  const words = clean.trim() ? clean.trim().split(/\s+/).length : 0
  $("stats").textContent = `${clean.length} chars · ${words} words`
}

// ── Pill lists ───────────────────────────────────────────────────────────────
function createPill(text, onRemove) {
  const li = document.createElement("li")
  li.className = "pill"
  const span = document.createElement("span")
  span.textContent = text
  const btn = document.createElement("button")
  btn.className = "pill-remove"
  btn.type = "button"
  btn.textContent = "✕"
  btn.setAttribute("aria-label", `Remove ${text}`)
  btn.addEventListener("click", onRemove)
  li.append(span, btn)
  return li
}

function renderList(listId, values, key) {
  const list = $(listId)
  list.innerHTML = ""
  values.forEach((value, index) => {
    list.appendChild(createPill(value, () => {
      state[key].splice(index, 1)
      renderAllLists()
      maybeAutoGenerate()
    }))
  })
}

function renderAllLists() {
  renderList("constraintsList", state.constraints, "constraints")
  renderList("mustList",        state.mustInclude, "mustInclude")
  renderList("avoidList",       state.avoid,       "avoid")
}

function addItem(inputId, key) {
  const input = $(inputId)
  const value = input.value.trim()
  if (!value) return
  if (!state[key].includes(value)) state[key].push(value)
  input.value = ""
  renderAllLists()
  maybeAutoGenerate()
}

// ── Form helpers ─────────────────────────────────────────────────────────────
function getFormValues() {
  return {
    type:             $("type").value,
    level:            $("level").value,
    topic:            $("topic").value.trim(),
    tone:             $("tone").value.trim() || "clear",
    audience:         $("audience").value.trim() || "general audience",
    format:           $("format").value,
    length:           $("length").value,
    context:          $("context").value.trim(),
    constraints:      [...state.constraints],
    mustInclude:      [...state.mustInclude],
    avoid:            [...state.avoid],
    includeExamples:  $("includeExamples").checked,
    includeSteps:     $("includeSteps").checked,
    includeChecklist: $("includeChecklist").checked,
    includeQuestions: $("includeQuestions").checked,
  }
}

// ── Local prompt builder (instant, no API) ───────────────────────────────────
function buildLocalPrompt(v) {
  if (!v.topic) return "Please enter a topic or goal to generate a prompt."

  const lines = [
    promptTemplates[v.type] || "You are a helpful expert assistant.",
    `Task: Create a ${v.tone} ${v.type.toLowerCase()} response about "${v.topic}".`,
    `Audience: ${v.audience}.`,
    `Difficulty: ${v.level}.`,
    `Format: ${v.format}. ${formatGuidanceMap[v.format] || ""}`,
    `Length: ${v.level}. ${lengthGuidanceMap[v.length] || ""}`,
    "Output Requirements:",
    "- Keep the response practical, specific, and action-oriented.",
  ]

  if (v.context) lines.push(`Context: ${v.context}`)
  if (v.constraints.length) {
    lines.push("Constraints:")
    v.constraints.forEach(c => lines.push(`- ${c}`))
  }
  if (v.mustInclude.length) {
    lines.push("Must Include:")
    v.mustInclude.forEach(m => lines.push(`- ${m}`))
  }
  if (v.avoid.length) {
    lines.push("Avoid:")
    v.avoid.forEach(a => lines.push(`- ${a}`))
  }
  if (v.includeQuestions) lines.push("- Start by listing critical clarifying questions if any ambiguity exists.")
  if (v.includeSteps)     lines.push("- Provide a numbered step-by-step approach.")
  if (v.includeExamples)  lines.push("- Include at least one strong example and one weak example.")
  if (v.includeChecklist) lines.push("- End with a short quality checklist.")
  lines.push("Final instruction: Optimise for usefulness over verbosity.")

  return lines.join("\n")
}

// ── Output & history ─────────────────────────────────────────────────────────
function setOutput(text, aiEnhanced = false) {
  const el = $("result")
  el.textContent = text
  el.classList.toggle("placeholder", false)

  if (aiEnhanced) {
    el.style.borderLeft = "3px solid #7c3aed"
    el.style.paddingLeft = "12px"
  } else {
    el.style.borderLeft = ""
    el.style.paddingLeft = ""
  }

  updateStats(text)
  pushHistory(text, $("type").value, $("topic").value.trim(), aiEnhanced)
}

function pushHistory(text, type, topic, aiEnhanced) {
  const label = topic || text.slice(0, 60)
  history.unshift({ text, type, label, aiEnhanced, ts: Date.now() })
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  renderHistory()
}

function renderHistory() {
  const section = $("historySection")
  const list    = $("historyList")

  if (!history.length) { section.classList.add("hidden"); return }
  section.classList.remove("hidden")

  list.innerHTML = ""
  history.forEach((entry, i) => {
    const li   = document.createElement("li")
    li.className = "history-item"

    const label = document.createElement("span")
    label.className = "hist-label"
    label.textContent = entry.label || entry.text.slice(0, 60)
    label.title = entry.text

    const badge = document.createElement("span")
    badge.className = "hist-type"
    badge.textContent = entry.type + (entry.aiEnhanced ? " ✦" : "")

    const copyBtn = document.createElement("button")
    copyBtn.className = "hist-copy"
    copyBtn.textContent = "Copy"
    copyBtn.addEventListener("click", e => {
      e.stopPropagation()
      copyText(entry.text, copyBtn)
    })

    li.append(label, badge, copyBtn)
    li.addEventListener("click", () => {
      $("result").textContent = entry.text
      $("result").classList.remove("placeholder")
      updateStats(entry.text)
    })

    list.appendChild(li)
  })
}

// ── Copy ─────────────────────────────────────────────────────────────────────
function copyText(text, btn) {
  if (!text || text === DEFAULT_TEXT) return
  navigator.clipboard.writeText(text)
    .then(() => {
      const orig = btn.textContent
      btn.textContent = "Copied!"
      setTimeout(() => { btn.textContent = orig }, 1400)
      showToast("Copied to clipboard!")
    })
    .catch(() => showToast("Copy failed — try manually.", true))
}

// ── Preset ───────────────────────────────────────────────────────────────────
function savePreset() {
  const payload = { ...getFormValues(), state: { ...state } }
  localStorage.setItem(PRESET_KEY, JSON.stringify(payload))
  showToast("Preset saved!")
}

function loadPreset() {
  const raw = localStorage.getItem(PRESET_KEY)
  if (!raw) { showToast("No saved preset found.", true); return }
  const p = JSON.parse(raw)

  $("type").value     = p.type     || "Writing"
  $("level").value    = p.level    || "Intermediate"
  $("topic").value    = p.topic    || ""
  $("tone").value     = p.tone     || ""
  $("audience").value = p.audience || ""
  $("format").value   = p.format   || "Markdown"
  $("length").value   = p.length   || "Medium"
  $("context").value  = p.context  || ""

  $("includeExamples").checked  = Boolean(p.includeExamples)
  $("includeSteps").checked     = Boolean(p.includeSteps)
  $("includeChecklist").checked = Boolean(p.includeChecklist)
  $("includeQuestions").checked = Boolean(p.includeQuestions)
  $("autoGenerate").checked     = Boolean(p.autoGenerate)

  state.constraints = p.state?.constraints || ["Be specific", "Use actionable language"]
  state.mustInclude  = p.state?.mustInclude || []
  state.avoid        = p.state?.avoid       || []

  renderAllLists()
  showToast("Preset loaded!")
  maybeAutoGenerate()
}

// ── Topic suggestion ──────────────────────────────────────────────────────────
function suggestTopic() {
  const type = $("type").value
  const opts = topicSuggestions[type] || ["Create a practical, task-focused prompt"]
  $("topic").value = opts[Math.floor(Math.random() * opts.length)]
  maybeAutoGenerate()
}

// ── Auto-generate ─────────────────────────────────────────────────────────────
function maybeAutoGenerate() {
  if ($("autoGenerate").checked) generatePrompt()
}

function generatePrompt() {
  const v = getFormValues()
  const output = buildLocalPrompt(v)
  setOutput(output, false)
}

// ── Clear ─────────────────────────────────────────────────────────────────────
function clearForm() {
  $("topic").value     = ""
  $("tone").value      = ""
  $("audience").value  = ""
  $("context").value   = ""
  $("type").selectedIndex      = 0
  $("level").value     = "Intermediate"
  $("format").value    = "Markdown"
  $("length").value    = "Medium"
  $("includeExamples").checked  = true
  $("includeSteps").checked     = true
  $("includeChecklist").checked = false
  $("includeQuestions").checked = false
  $("autoGenerate").checked     = false

  state.constraints = ["Be specific", "Use actionable language"]
  state.mustInclude = []
  state.avoid       = []
  renderAllLists()

  const el = $("result")
  el.textContent = DEFAULT_TEXT
  el.classList.add("placeholder")
  el.style.borderLeft = ""
  el.style.paddingLeft = ""
  updateStats("")
}

// ── Clear history ─────────────────────────────────────────────────────────────
function clearHistory() {
  history = []
  localStorage.removeItem(HISTORY_KEY)
  renderHistory()
  showToast("History cleared.")
}

// ── Wire events ───────────────────────────────────────────────────────────────
function wireAddButton(buttonId, inputId, key) {
  $(buttonId).addEventListener("click", () => addItem(inputId, key))
  $(inputId).addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); addItem(inputId, key) }
  })
}

function wireAutoInputs() {
  const textFields = ["topic", "tone", "audience", "context"]
  const otherFields = ["type", "level", "format", "length",
    "includeExamples", "includeSteps", "includeChecklist", "includeQuestions", "autoGenerate"]
  textFields.forEach(id => $(id).addEventListener("input",  maybeAutoGenerate))
  otherFields.forEach(id => $(id).addEventListener("change", maybeAutoGenerate))
}

$("generateBtn").addEventListener("click", generatePrompt)
$("copyBtn").addEventListener("click", () => copyText($("result").textContent, $("copyBtn")))
$("clearBtn").addEventListener("click", clearForm)
$("savePresetBtn").addEventListener("click", savePreset)
$("loadPresetBtn").addEventListener("click", loadPreset)
$("randomTopicBtn").addEventListener("click", suggestTopic)
$("clearHistoryBtn").addEventListener("click", clearHistory)

wireAddButton("addConstraintBtn", "constraintInput", "constraints")
wireAddButton("addMustBtn",       "mustInput",       "mustInclude")
wireAddButton("addAvoidBtn",      "avoidInput",      "avoid")
wireAutoInputs()

// ── Init ──────────────────────────────────────────────────────────────────────
renderAllLists()
renderHistory()
updateStats("")
