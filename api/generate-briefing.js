// api/generate-briefing.js
// Vercel serverless function (Node.js, CommonJS, no dependencies — uses native fetch).
// Calls the Anthropic API with the web search tool enabled to generate a full
// candidate briefing book: company basics, product overview, job fit, and an
// interview guide. Requires ANTHROPIC_API_KEY set in Vercel project env vars.

const MAX_FIELD_LEN = 20000; // guard against oversized/abusive payloads
const MAX_PANELISTS = 10;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function clean(v, max) {
  if (typeof v !== 'string') return '';
  const trimmed = v.trim();
  return trimmed.length > (max || MAX_FIELD_LEN) ? trimmed.slice(0, max || MAX_FIELD_LEN) : trimmed;
}

function val(v, fallback) {
  const c = clean(v);
  return c.length ? c : (fallback || 'Not provided');
}

function buildPanelistBlock(panelists, recruiterName, hiringManagerName, autoDetectRecruiter) {
  if (Array.isArray(panelists) && panelists.length) {
    return {
      mode: 'full_profiles',
      text: panelists.slice(0, MAX_PANELISTS).map((p) => `---
Name: ${val(p && p.name)}
Title / Role: ${val(p && p.title)}
Relationship to the role: ${val(p && p.relationship)}
LinkedIn profile (pasted text):
${val(p && p.linkedin)}
---`).join('\n\n'),
    };
  }

  const namedContacts = [recruiterName, hiringManagerName]
    .map((n) => clean(n))
    .filter((n) => n.length);

  if (namedContacts.length) {
    return {
      mode: 'named_lookup',
      text: `No pasted LinkedIn profiles were provided, but these named contacts were given. Use web
search to find whatever public information exists about them at this company (company bio
pages, press mentions, conference speaker bios, public professional profile snippets surfaced
in search results) and build a lighter, best-effort dossier for each. Clearly flag this as
search-derived rather than sourced from a pasted profile, and note plainly if nothing
findable turned up for a given name — don't invent background.

Named contacts to look up:
${namedContacts.map((n) => `- ${n}`).join('\n')}`,
    };
  }

  if (autoDetectRecruiter) {
    return {
      mode: 'auto_detect',
      text: `No panel members, recruiter, or hiring manager names were provided, but the user asked
you to try to identify the likely recruiter or talent acquisition contact for this role
via web search. Try approaches like: searching the company name plus "talent acquisition"
or "recruiter" or "people team", checking whether the company's careers/team pages name
anyone in recruiting, and checking whether the job posting text itself names a recruiter
or contact. Only surface a name if you have a reasonably specific signal tying them to
this company's recruiting function — do not guess based on generic role titles alone, and
never present a guess as a confirmed identity. If nothing sufficiently specific turns up,
say so plainly rather than naming someone on weak evidence.`,
    };
  }

  return {
    mode: 'none',
    text: '(No panel members, recruiter, or hiring manager identified, and auto-detection was not requested. Do not attempt individual dossiers or map questions to specific people — instead produce a complete, well-tailored set of generic interview questions based on the role, seniority level, industry, and company context available.)',
  };
}

const SYSTEM_PROMPT = `You are an experienced hiring-intelligence analyst producing a confidential interview
briefing book for a job candidate. You were engaged by someone helping that candidate
prepare — you are not the candidate, and you write directly to them in a clear, direct,
practical tone, like a sharp colleague prepping them, not a corporate report.

You have a web search tool available. Use it to verify and fill in real, current
information about the company — recent news, what they actually build/sell, financial
or funding signals, culture signals, leadership — whenever the provided context is
incomplete or you need up-to-date facts. Prefer primary sources (the company's own site,
reputable news, SEC/Crunchbase-style data, Glassdoor/Blind for culture signals) over
speculation.

When a recruiter or hiring manager is identified by name only (no pasted LinkedIn profile),
use web search to find whatever public information exists about that person at that
company — company "About/Team" pages, press mentions, conference or podcast appearances,
public professional profile snippets that surface in search results. Build a lighter,
best-effort dossier from whatever turns up, and say plainly when nothing useful was found
rather than guessing at their background.

If asked to auto-detect a likely recruiter or talent acquisition contact with no name
given at all, treat this as a low-confidence inference task, not an identification task.
Only name someone if there is a reasonably specific signal connecting them to this
company's recruiting function for this kind of role — never present a guess as confirmed,
and never name a real person based on a generic title match alone (e.g. "someone at this
company is probably in recruiting" is not sufficient). Saying "no confident match found"
is the correct outcome more often than not, and is always preferable to a wrong guess
about a real person.

Always produce the full briefing book structure below in every response — every section,
every time. Never omit, shrink, or water down a section because an optional input was
marked "Not provided." Reason from whatever is available and note plainly where you are
working with limited information or inference — the structure and depth of the output
stays standard regardless of which optional fields were filled in.

Separate confirmed facts from reasonable inference — flag inferences explicitly ("likely,"
"based on X, this suggests..."). Do not invent specific facts (dates, numbers, names) that
you cannot find or verify — say "not enough information" instead of guessing.

Format your entire response in clean Markdown using the exact section headers given below.`;

function buildUserPrompt(input) {
  const candidateName = val(input.candidateName, 'The candidate');
  const jobTitle = val(input.jobTitle, 'this role');
  const candidateBackground = val(input.candidateBackground);
  const candidateLinkedin = val(input.candidateLinkedin);
  const companyName = val(input.companyName);
  const companyContext = val(input.companyContext, 'Not provided — research and flag what is confirmed vs. inferred');
  const jobDescription = val(input.jobDescription);
  const stage = val(input.interviewStage, 'Not specified');
  const panelistInfo = buildPanelistBlock(
    input.panelists, input.recruiterName, input.hiringManagerName, !!input.autoDetectRecruiter
  );
  const panelistText = panelistInfo.text;

  const interviewGuideModeNote = {
    full_profiles: 'Full pasted LinkedIn profiles were provided for each panelist — produce complete, specific dossiers for each, with questions mapped to individual panelists as instructed below.',
    named_lookup: 'Only name(s) were provided, no pasted profiles — use web search to build lighter, best-effort dossiers for the named recruiter/hiring manager as instructed below, clearly flagged as search-derived. Still map anticipated and smart questions to these named people where the search results support it.',
    auto_detect: 'No names were given, but the user asked you to attempt to identify the likely recruiter/talent acquisition contact via web search. Produce the "Likely Recruiter / TA Contact" subsection described below with whatever confidence-appropriate result you find (a tentative match, or a plain statement that none could be confidently identified), then still produce the full generic question set in 6b/6c unless a confident match with real background was found.',
    none: 'No panel members, recruiter, or hiring manager were identified at all, and auto-detection was not requested — skip section 6a entirely (state plainly that no individual dossiers could be produced) and go straight to a complete, well-tailored set of generic interview questions in 6b/6c based on the role, seniority, industry, and company context. Do not pad this with a thin or apologetic version — make the generic questions genuinely sharp and specific to this role and company.',
  }[panelistInfo.mode];

  return `Produce a complete candidate briefing book now. Use web search as needed to verify
and enrich company and role information.

=== INPUTS ===

CANDIDATE NAME: ${candidateName}
TARGET ROLE: ${jobTitle}
INTERVIEW STAGE: ${stage}

CANDIDATE RESUME / BACKGROUND:
${candidateBackground}

CANDIDATE LINKEDIN PROFILE (pasted text):
${candidateLinkedin}

COMPANY NAME:
${companyName}

ADDITIONAL COMPANY CONTEXT PROVIDED BY THE USER:
${companyContext}

JOB DESCRIPTION (full text):
${jobDescription}

INTERVIEW PANEL MEMBERS:
${panelistText}

INTERVIEW GUIDE MODE FOR THIS REQUEST: ${interviewGuideModeNote}

=== PRODUCE THIS EXACT STRUCTURE ===

# Briefing Book: ${candidateName} — ${jobTitle} at ${companyName}

## 1. Executive Summary
- 3–5 sentences: the single most important things to know walking in, and the one
  thing this candidate most needs to accomplish in this interview.

## 2. Company Basics
- Snapshot: what the company is, size, stage (startup/growth/mature), industry, HQ
- Financial health / funding / stage signals if findable
- Leadership: CEO and other relevant leaders, tenure and background
- Recent developments (last 12–24 months): funding, layoffs, pivots, leadership changes,
  notable news — state plainly what's confirmed via search vs. what you're inferring
- Culture signals: what's praised vs. criticized in available reviews/public sentiment

## 3. Product & Market Overview
- What the company actually builds or sells, in plain language
- Who their customers are and how they make money
- Market position: competitors, differentiation, where they're growing or under pressure
- How this specific role connects to the product — what the person in this seat actually
  contributes to

## 4. Role Reality Check
- What the job description says vs. what the role likely actually involves day to day
- Why this role is probably open (backfill, growth, restructure) based on available signals
- What "success in the first 90 days" likely looks like in this seat
- Anything vague, inflated, or conspicuously missing from the job description (scope,
  team size, reporting line, requirements mismatched to seniority level)

## 5. Job Fit Assessment
Compare the candidate's background directly against this role's requirements:
- **Must-Have Alignment (0–10):** does the candidate meet the fundamental non-negotiables
  for this role? Show your work — which requirements are clearly met, which are unclear,
  which are gaps.
- **Growth / Energizer Potential (0–10):** how much of this role likely involves work the
  candidate would find engaging based on their background and trajectory?
- **Risk / Gap Concerns (0–10, where 10 = no concerns):** any real gaps, overqualification
  risk, or mismatch between the candidate's level and the role's scope?
- **Overall fit label:** Strong Fit / Good Fit / Stretch / Weak Fit — with one paragraph
  of reasoning.
- **How to position it:** 2–3 concrete suggestions for how the candidate should frame
  their background in this specific interview, given any gaps identified above.
- If candidate background was not provided, say so plainly and skip only the
  candidate-specific comparison — still produce the full section structure noting what
  would be needed to complete it.

## 6. Interview Guide
Follow the INTERVIEW GUIDE MODE noted above for how to handle this section:

### 6a. Panel Member Dossiers
- If full profiles were provided: for each panelist, give a background summary (career
  path, tenure at company, tenure in role, relevant expertise), what their role in the
  process likely means for what they're evaluating, likely interview focus based on
  their background, genuine rapport points visible in their profile, and any
  tenure/background detail worth flagging as yellow or red.
- If only a recruiter/hiring manager name was given: build the lightest dossier the
  web search results actually support (title, tenure, background if findable) and say
  plainly if nothing came up — never fabricate specifics.
- If auto-detection was requested (no names given): add a subsection titled
  **"Likely Recruiter / TA Contact (auto-detected)"**. Report either (a) a tentative
  match with the specific evidence found and an explicit confidence caveat that this
  is inferred, not confirmed, or (b) a plain statement that no confident match could
  be identified from public sources — do not present a guess as fact, and do not name
  someone based on weak/generic evidence.
- If nothing was identified and auto-detection wasn't requested: skip this subsection
  with a one-line note that no individual dossiers were possible, and move straight to
  6b/6c.

### 6b. Anticipated Interview Questions
- If panelists (full or named-lookup) exist: 5–8 questions the candidate should
  prepare for, each mapped to the panelist most likely to ask it and why, calibrated
  to that panelist's seniority and background.
- If no individuals were identified at all: 6–8 sharp, non-generic questions grounded
  in this specific role, seniority level, industry, and company context — organized by
  theme (e.g., technical depth, leadership/scope, culture fit) instead of by person.
  These should read as genuinely tailored to this job, not boilerplate.

### 6c. Smart Questions to Ask
- If panelists (full or named-lookup) exist: 5–8 questions organized by which
  panelist each lands best with and why. At least one should surface team stability,
  decision-making, or role scope not already covered in the job posting.
- If no individuals were identified at all: 5–8 questions organized by theme instead
  (team/scope, strategy/roadmap, culture, growth) — still specific to this company and
  role, still no generic filler.

## 7. Red Flag Assessment
- **Job posting red flags** — inflated requirements, missing scope/team info, signs of a
  ghost listing, unusually long time open
- **Company red flags** — instability, leadership churn, concerning news, growth signals
  that don't add up
- **Panel/people red flags** — unusual turnover, a panelist very new to their own role,
  inconsistent or disorganized information about the process
- Mark each item's severity: 🔴 Serious concern / 🟡 Worth asking about
- If a category has nothing notable, say so explicitly rather than manufacturing a flag

## 8. Bottom Line
- A short, direct closing: the one or two things this candidate most needs to remember,
  and a clear go/proceed-with-eyes-open/reconsider read given everything above.

## Sources
- List the URLs and titles of anything you found via web search that materially
  informed this briefing. If you didn't need to search, say so.`;
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Server misconfigured: ANTHROPIC_API_KEY is not set in this Vercel project\'s environment variables.' });
    return;
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(body || '{}');
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON body.' });
      return;
    }
  }

  if (!body.jobDescription || !clean(body.jobDescription).length) {
    res.status(400).json({ error: 'A job description is required to generate a briefing.' });
    return;
  }
  if (Array.isArray(body.panelists) && body.panelists.length > MAX_PANELISTS) {
    res.status(400).json({ error: `Please limit panel members to ${MAX_PANELISTS} or fewer.` });
    return;
  }

  const depth = body.depth === 'fast' ? 'fast' : 'thorough';
  const model = depth === 'fast' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-5';
  const maxSearches = depth === 'fast' ? 4 : 8;

  const userPrompt = buildUserPrompt(body);

  async function callClaude(messages) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: maxSearches,
          },
        ],
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`Anthropic API error ${resp.status}: ${errText.slice(0, 500)}`);
    }
    return resp.json();
  }

  try {
    let messages = [{ role: 'user', content: userPrompt }];
    let response = await callClaude(messages);
    let allBlocks = (response.content || []).slice();

    // Handle two documented "not actually done" cases, each capped so total
    // round trips stay bounded within the function's time budget:
    //  - pause_turn: the API paused mid-turn (e.g. during a long tool-use chain)
    //    and expects the paused assistant message resent as-is to continue.
    //  - max_tokens: the response hit the per-call output cap before finishing
    //    the full document structure — explicitly ask it to keep going from
    //    where it left off rather than starting over.
    // Earlier attempts only kept the FINAL response's content, silently
    // discarding everything written in earlier rounds — that's what caused
    // briefings to cut off mid-section. Every round's content is now
    // accumulated into allBlocks instead.
    let attempts = 0;
    const MAX_CONTINUATIONS = 5;
    while (
      (response.stop_reason === 'pause_turn' || response.stop_reason === 'max_tokens') &&
      attempts < MAX_CONTINUATIONS
    ) {
      if (response.stop_reason === 'max_tokens') {
        messages = messages.concat([
          { role: 'assistant', content: response.content },
          {
            role: 'user',
            content: 'Continue exactly where you left off. Do not repeat any text you already ' +
              'wrote and do not restart the document — resume mid-section if needed and keep ' +
              'going until the full structure (through the ## Sources section) is complete.',
          },
        ]);
      } else {
        messages = messages.concat([{ role: 'assistant', content: response.content }]);
      }
      response = await callClaude(messages);
      allBlocks = allBlocks.concat(response.content || []);
      attempts += 1;
    }

    const textParts = [];
    const sources = [];
    const seenUrls = new Set();

    for (const block of allBlocks) {
      if (block.type === 'text') {
        textParts.push(block.text);
        if (Array.isArray(block.citations)) {
          for (const c of block.citations) {
            if (c.url && !seenUrls.has(c.url)) {
              seenUrls.add(c.url);
              sources.push({ url: c.url, title: c.title || c.url });
            }
          }
        }
      } else if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.url && !seenUrls.has(r.url)) {
            seenUrls.add(r.url);
            sources.push({ url: r.url, title: r.title || r.url });
          }
        }
      }
    }

    const briefingMarkdown = textParts.join('\n\n').trim();

    res.status(200).json({
      ok: true,
      model,
      depth,
      briefingMarkdown,
      sources,
      stopReason: response.stop_reason,
    });
  } catch (err) {
    res.status(502).json({ error: 'Failed to generate briefing: ' + (err && err.message ? err.message : String(err)) });
  }
};
