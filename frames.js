// Frame representation and its one sentence template (continuation plan v3).
//
//     frame  = { actor, action, outcome }
//     render = "Then {actor} {action}, and now {outcome}."
//
// This is a MODEL BOUNDARY under test, not a new content key. `ids.js` still
// owns `normalizedContent`; `merge_predicate.js` still decides sameness. A
// grown node's `expr` is derived from its frame by `frameExpr` so that
// `ids.nodeId` — which hashes expr — covers all three slots, and two frames
// differing in any slot get distinct ids.
//
// ── why the actor list is closed ────────────────────────────────────────────
//
// Three adjacent free-text slots are not parseable back out of a sentence:
// nothing marks where one ends and the next begins. The template supplies a
// delimiter for the action/outcome boundary (", and now ") and the trailing
// ".". The actor/action boundary has NO delimiter, so it is recoverable only
// because `actor` ranges over a closed, per-story list — longest match wins,
// and the match must end on a word boundary.
//
// The word-boundary requirement is not decoration. With entities ["Red"] and
// the sentence "Then Red's mother calls her back, and now ...", a bare prefix
// match yields actor "Red", action "'s mother calls her back" — a SILENT
// misparse, which is worse than a rejection. Requiring the next character to
// be a space turns it into a rejection, and adding "Red's mother" to the list
// turns it into a correct parse.
//
// ── deviations from the plan text, stated rather than absorbed ──────────────
//
//   1. `action` also excludes "." (the plan excludes only "," and newline).
//      A period inside the action produces two sentences where the format
//      declares one, which is the thing the representation is for.
//   2. The story's first sentence still carries the "Then " prefix. It reads
//      slightly oddly aloud, and that cost is accepted: every history line
//      having the identical shape is what a base model completes from, and
//      the completion cue is "NEXT EVENT: Then ".

(function attachFrames(root) {
  "use strict";

  const PREFIX = "Then ";
  const SEPARATOR = ", and now ";
  const TERMINATOR = ".";

  // Substrings a slot value may never contain, because the parser uses them
  // as structure. Checked at authoring time (tests/frames.test.js) and again
  // on every model sample before it is accepted.
  const SLOT_FORBIDDEN = {
    actor: [SEPARATOR, "\n"],
    action: [SEPARATOR, "\n", ",", "."],
    outcome: [SEPARATOR, "\n", "."],
  };

  const SLOTS = ["actor", "action", "outcome"];

  function render(frame) {
    return `${PREFIX}${frame.actor} ${frame.action}${SEPARATOR}${frame.outcome}${TERMINATOR}`;
  }

  // The canonical join that becomes a grown node's `expr`. "|" is not a
  // reserved template marker, so it cannot collide with slot content the
  // grammar allows; it is only a field separator for hashing.
  function frameExpr(frame) {
    return `${frame.actor} | ${frame.action} | ${frame.outcome}`;
  }

  // Longest entity first, so "Red's mother" is preferred over "Red".
  function sortedEntities(entities) {
    return [...entities].sort((a, b) => b.length - a.length || a.localeCompare(b));
  }

  function matchActor(rest, entities) {
    for (const entity of sortedEntities(entities)) {
      if (!rest.startsWith(entity)) continue;
      if (rest[entity.length] !== " ") continue; // word boundary, see header
      return entity;
    }
    return null;
  }

  // Returns a frame, or { error } naming the first structural failure. Never
  // throws and never guesses: an unparseable sample is data about the format,
  // so the caller records the reason rather than a stack trace.
  function parse(sentence, entities) {
    const text = String(sentence);
    if (text.includes("\n")) return { error: "newline in sentence" };
    if (!text.startsWith(PREFIX)) return { error: `missing "${PREFIX}" prefix` };
    if (!text.endsWith(TERMINATOR)) return { error: `missing "${TERMINATOR}" terminator` };

    const body = text.slice(PREFIX.length, -TERMINATOR.length);
    const cut = body.indexOf(SEPARATOR);
    if (cut === -1) return { error: `missing "${SEPARATOR}" separator` };

    const left = body.slice(0, cut);
    const outcome = body.slice(cut + SEPARATOR.length);

    const actor = matchActor(left, entities);
    if (actor === null) return { error: "no entity matches the actor slot" };
    const action = left.slice(actor.length + 1);

    const frame = { actor, action, outcome };
    const problems = validate(frame, entities);
    return problems.length ? { error: problems[0] } : frame;
  }

  // Slot-level legality, independent of whether the frame came from an author
  // or from the model. Returns a list of problems; empty means legal.
  function validate(frame, entities) {
    const problems = [];
    for (const slot of SLOTS) {
      const value = frame[slot];
      if (typeof value !== "string" || value.trim() === "") {
        problems.push(`${slot} is empty`);
        continue;
      }
      if (value !== value.trim()) problems.push(`${slot} has leading or trailing space`);
      for (const forbidden of SLOT_FORBIDDEN[slot]) {
        if (value.includes(forbidden)) {
          problems.push(`${slot} contains reserved ${JSON.stringify(forbidden)}`);
        }
      }
    }
    if (entities && !entities.includes(frame.actor)) {
      problems.push(`actor ${JSON.stringify(frame.actor)} is not in the entity list`);
    }
    return problems;
  }

  // ── GBNF ───────────────────────────────────────────────────────────────────
  //
  // The grammar is the skeleton, not the content: it fixes the markers and
  // the actor enum and leaves action/outcome free within their character
  // classes. Under it, parse rate is 1.0 by construction — so the parse-rate
  // number is only meaningful for the UNCONSTRAINED diagnostic batch, which
  // is what it is there to measure.
  //
  // Bounded repetition ({1,N}) is what keeps a free character class from
  // running to the token cap. A length-stopped completion is a hard error in
  // llm_client.js, so an unbounded class would turn ordinary verbosity into
  // a run failure.
  //
  // Sized off the AUTHORED corpus (longest action 62 chars, longest outcome
  // 86), then given enough headroom that the bound does not BIND. Those are
  // two different requirements and the second one is easy to miss.
  //
  // GBNF does not reject at a bound — it forces the terminator. A model that
  // wants a longer outcome gets cut mid-word with a "." appended, producing a
  // sample that parses perfectly and is garbage:
  //
  //     …and now the wolf has run into the house while Red has stopped to g.
  //
  // At outcome 110 that hit 7 of 30 samples in the first graded batch, and 3
  // of the 5 samples the grader called implausible were sitting exactly on
  // it — so the bound was silently costing the sentence arm plausibility.
  // This is a worse failure than the n_predict cap it replaced: the cap at
  // least raised a truncation error that got recorded.
  //
  // outcome is therefore ~2x the authored maximum. `action` is left at 80:
  // it never bound once in 30 samples, so there is nothing to fix and
  // widening it would only license longer actions.
  const ACTION_MAX_CHARS = 80;
  const OUTCOME_MAX_CHARS = 170;

  // The slot character class, sized to the authored corpus: across all 36
  // hand-written frames the only non-alphanumeric characters used are the
  // space and the apostrophe, and no authored action or outcome contains a
  // comma. Digits are allowed because they cost nothing.
  //
  // This closes, BY CONSTRUCTION, every parse failure the grower's first
  // frames run produced — all four were rules `validate` enforced and the
  // generator was free to break:
  //   - foreign script leaking into a slot ("…and the村民们"): the class is
  //     ASCII only;
  //   - a slot with a leading or trailing space, which the grammar used to
  //     emit whenever a bound was hit just after a space ("…when she gets ."):
  //     a slot's first and last character can no longer be a space;
  //   - a second ", and now " inside `outcome`, bundling two events into one
  //     node: `outcome` cannot contain a comma at all, so the separator
  //     cannot occur inside it.
  const SLOT_CHAR_CLASS = "[a-zA-Z0-9']";

  // Longest actor, so a caller can size a token budget that the grammar —
  // not the budget — is what binds.
  function maxSentenceChars(entities, options = {}) {
    const actionMax = options.actionMax === undefined ? ACTION_MAX_CHARS : options.actionMax;
    const outcomeMax = options.outcomeMax === undefined ? OUTCOME_MAX_CHARS : options.outcomeMax;
    const actor = Math.max(...[...entities].map((e) => e.length));
    return PREFIX.length + actor + 1 + actionMax + SEPARATOR.length + outcomeMax + TERMINATOR.length;
  }

  // Token budget for a grammar-constrained sentence, derived from the grammar
  // so that the grammar — not the budget — is what binds. Three chars per
  // token is pessimistic for English (~4 is typical); the doubling is headroom
  // for a tokenizer that splits worse than expected on some name. A budget
  // that binds first truncates the longest samples non-randomly, which is the
  // confound the first Stage 0 run had.
  const CHARS_PER_TOKEN_FLOOR = 3;
  const TOKEN_SAFETY_FACTOR = 2;

  function tokenBudget(entities, options = {}) {
    return Math.ceil(maxSentenceChars(entities, options) / CHARS_PER_TOKEN_FLOOR) * TOKEN_SAFETY_FACTOR;
  }

  // The sentence-arm prompt: a few-shot template with {{title}}, {{history}}
  // and optionally {{story}} — the told story's own frames, the context
  // branch.v2 has always given the JSON boundary. A template without
  // {{story}} (frames.v1) is unaffected by passing a spine. The template ends at
  // its completion cue; the single trailing space is added here, not kept in
  // the file, where an editor would strip it. "Then " is NOT in the prompt —
  // the grammar emits it, and a cue the sampler is about to produce must not
  // also be in the prompt.
  function historyPrompt(template, { title = "", frames = [], spine = null } = {}) {
    const rendered = String(template)
      .replaceAll("{{title}}", title || "")
      .replaceAll("{{story}}", (spine || []).map((frame) => render(frame)).join("\n"))
      .replaceAll("{{history}}", frames.map((frame) => render(frame)).join("\n"));
    return `${rendered.replace(/\s+$/, "")} `;
  }


  function gbnfString(text) {
    return JSON.stringify(String(text));
  }

  function grammar(entities, { actionMax = ACTION_MAX_CHARS, outcomeMax = OUTCOME_MAX_CHARS } = {}) {
    const alternatives = sortedEntities(entities).map(gbnfString).join(" | ");
    return [
      `root ::= ${gbnfString(PREFIX)} actor " " action ${gbnfString(SEPARATOR)} outcome ${gbnfString(TERMINATOR)}`,
      `actor ::= ${alternatives}`,
      // edge/mid rather than one class: the first and last character of a
      // slot may not be a space, which is what `validate` has always required.
      `action ::= edge mid{0,${actionMax - 2}} edge`,
      `outcome ::= edge mid{0,${outcomeMax - 2}} edge`,
      `edge ::= ${SLOT_CHAR_CLASS}`,
      'mid ::= edge | " "',
      "",
    ].join("\n");
  }


  const api = {
    PREFIX, SEPARATOR, TERMINATOR, SLOTS, SLOT_FORBIDDEN,
    render, parse, validate, frameExpr, grammar, maxSentenceChars, tokenBudget, historyPrompt,
    SLOT_CHAR_CLASS,
    ACTION_MAX_CHARS, OUTCOME_MAX_CHARS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.StoryDagFrames = api;
})(typeof window !== "undefined" ? window : globalThis);
