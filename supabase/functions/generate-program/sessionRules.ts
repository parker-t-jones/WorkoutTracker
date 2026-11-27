// Deterministic session-design guard for generate-program.
// Pure TypeScript (no Deno APIs, erasable syntax only) so node can unit-test it:
//   node --test tests/sessionRules.test.js
//
// repairProgram() reorders each day into coach order (warm-up → power →
// main → secondary → accessory → core → conditioning), drops plyometrics that
// don't suit the athlete, caps same-pattern exercises at 2 per session and
// interleaves patterns so the same one isn't back-to-back. It never invents
// names: replacements come from the client's exercise catalog.

export type Tier =
  | "warmup"
  | "power"
  | "main_compound"
  | "secondary_compound"
  | "accessory"
  | "core"
  | "conditioning"

export type Pattern =
  | "squat"
  | "hinge"
  | "lunge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "core"
  | "carry"
  | "biceps"
  | "triceps"
  | "cardio"
  | "other"

export type RulesCatalogEntry = {
  name: string
  modality?: string | null
  movement_pattern?: string | null
  equipment_required?: string | null
  contraindication_tags?: string[] | null
}

export type RulesContext = {
  experience_level?: unknown
  goal?: unknown
  equipment?: unknown
  /** limitations + additional_notes free text */
  limitations?: unknown
  additional_notes?: unknown
  /** adaptive mode: per-exercise performance rows (pain_flagged, athlete_edits …) */
  exercise_performance?: unknown
  /** adaptive mode: prior week (athlete_edit per exercise) */
  prior_week_program?: unknown
}

export type RepairResult = {
  program: Record<string, unknown>
  fixes: string[]
  /** Sessions the repair left under the strength minimum (retry feedback). */
  shortfalls: string[]
}

type Ex = Record<string, unknown>

export const MAX_SAME_PATTERN = 2
export const MIN_STRENGTH_EXERCISES = 3
export const MAX_POWER_REPS = 5
export const MAX_POWER_SETS = 4

const TIER_RANK: Record<Tier, number> = {
  warmup: 0,
  power: 1,
  main_compound: 2,
  secondary_compound: 3,
  accessory: 4,
  core: 5,
  conditioning: 6,
}

/** Which tier survives a pattern cap first (main lift beats its primer). */
const KEEP_PRIORITY: Record<Tier, number> = {
  main_compound: 0,
  power: 1,
  secondary_compound: 2,
  accessory: 3,
  core: 4,
  conditioning: 5,
  warmup: 6,
}

const CAPPED_PATTERNS = new Set<Pattern>([
  "squat",
  "hinge",
  "lunge",
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "core",
  "carry",
  "biceps",
  "triceps",
])

const PATTERN_LABEL: Record<Pattern, string> = {
  squat: "squat",
  hinge: "hinge",
  lunge: "lunge/single-leg",
  horizontal_push: "horizontal push",
  vertical_push: "vertical push",
  horizontal_pull: "horizontal pull",
  vertical_pull: "vertical pull",
  core: "core",
  carry: "carry",
  biceps: "biceps",
  triceps: "triceps",
  cardio: "cardio",
  other: "other",
}

/** Patterns a dropped extra may be swapped toward (same body region). */
const REGION_GROUPS: Pattern[][] = [
  ["squat", "hinge", "lunge"],
  ["horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull"],
]

// ── Name / catalog classification ──────────────────────────────────────────

const WARMUP_RE = /warm-?up|\bmobility\b|\bactivation\b/i
const CONDITIONING_NAME_RE =
  /jump rope|skipping rope|jumping jacks?|high knees|burpee|\bsled\b|battle rope|assault bike|air bike|finisher|conditioning|metcon|mountain climber/i
// Plyometric / ballistic / Olympic. Kettlebell swings are deliberately NOT
// here: they're a ballistic hinge done for reps, not reactive jumping, and
// suit beginners — they stay hinge accessories.
const POWER_RE =
  /\bjump(s|ing)?\b|\bbound(s|ing)?\b|\bhops?\b|\bplyo|\bpogo|\bskater|med(icine)?[ -]?ball (throw|slam|toss|chest pass|scoop)|ball slam|wall ball|\bclean\b|\bsnatch\b|\bjerk\b|clap push/i
const OLYMPIC_RE = /\bclean\b|\bsnatch\b|\bjerk\b/i
const ISOLATION_RE =
  /\bfly\b|\bflyes?\b|\bflies\b|\braises?\b|\bcurls?\b|extension|kickback|pushdown|push-down|face pull|\bshrugs?\b|\bcalf\b|pullover|pull-apart|abduct|adduct|glute bridge|bodyweight squat|wall sit/i

const NAME_PATTERNS: Array<[RegExp, Pattern]> = [
  [/farmer|suitcase carry|\bcarry\b|\bcarries\b|yoke/i, "carry"],
  [/plank|dead bug|crunch|sit-?up|knee raise|leg raise|rollout|bird dog|pallof|hollow|russian twist|woodchop|v-?up|ab wheel|toes to bar|\bslam\b/i, "core"],
  [/split squat|lunge|step-?up|single[- ]leg|pistol|cossack|skater|\bhops?\b|\bbound/i, "lunge"],
  [/broad jump|deadlift|\brdl\b|good morning|hip thrust|glute bridge|swing|\bclean\b|\bsnatch\b|back extension|hyperextension|leg curl|hamstring curl|nordic|pull-through|med(icine)?[ -]?ball (scoop|overhead throw)/i, "hinge"],
  [/squat|leg press|hack|box jump|squat jump|jump squat|tuck jump|\bjumps?\b|leg extension|wall sit|wall ball|pogo/i, "squat"],
  [/pull-?ups?|chin-?ups?|pulldown|pull-down|muscle-?up/i, "vertical_pull"],
  [/\brows?\b|face pull|reverse fly|pull-apart|rear delt/i, "horizontal_pull"],
  [/overhead|shoulder press|military|push press|\bjerk\b|pike|handstand|arnold|lateral raise|front raise|landmine press|z press/i, "vertical_push"],
  [/bench|chest press|push-?up|\bdips?\b|chest fly|\bfly\b|\bflyes?\b|chest pass|floor press/i, "horizontal_push"],
  [/tricep|skull ?crusher|kickback|pushdown|push-down|close[- ]grip/i, "triceps"],
  [/curl/i, "biceps"],
]

const CATALOG_PATTERNS: Record<string, Pattern> = {
  squat: "squat",
  hinge: "hinge",
  lunge: "lunge",
  single_leg: "lunge",
  horizontal_push: "horizontal_push",
  vertical_push: "vertical_push",
  horizontal_pull: "horizontal_pull",
  vertical_pull: "vertical_pull",
  core: "core",
  carry: "carry",
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v)
}

function looseKey(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ")
}

export function isWarmup(ex: Ex, cat?: RulesCatalogEntry | null): boolean {
  return (
    WARMUP_RE.test(str(ex.name)) || str(cat?.movement_pattern) === "cardio_warmup"
  )
}

function isCardio(ex: Ex, cat?: RulesCatalogEntry | null): boolean {
  return (
    ex.modality === "cardio" ||
    cat?.modality === "cardio" ||
    str(cat?.movement_pattern).startsWith("cardio")
  )
}

export function isPower(ex: Ex): boolean {
  const name = str(ex.name)
  if (CONDITIONING_NAME_RE.test(name) || WARMUP_RE.test(name)) return false
  if (/\brope\b/i.test(name)) return false
  return POWER_RE.test(name)
}

/** Primary movement pattern from name first (specific), then catalog metadata. */
export function classifyPattern(ex: Ex, cat?: RulesCatalogEntry | null): Pattern {
  if (isCardio(ex, cat) || isWarmup(ex, cat)) return "cardio"
  const name = str(ex.name)
  // Single-leg work is its own pattern even when the catalog files it under
  // squat (Bulgarian Split Squat): it isn't a third bilateral squat.
  if (/split squat|lunge|step-?up|single[- ]leg|pistol/i.test(name)) return "lunge"
  const fromCatalog = CATALOG_PATTERNS[str(cat?.movement_pattern)]
  if (fromCatalog && !isPower(ex) && !ISOLATION_RE.test(name)) return fromCatalog
  for (const [re, pattern] of NAME_PATTERNS) {
    if (re.test(name)) return pattern
  }
  if (fromCatalog) return fromCatalog
  return "other"
}

function isMainLiftName(name: string): boolean {
  if (/romanian|\brdl\b|stiff|good morning|hip thrust|\brow\b|deficit push|single|split/i.test(name)) {
    return false
  }
  return /back squat|front squat|safety bar squat|box squat|(conventional |sumo |trap bar |hex bar |barbell )?deadlift|barbell bench|bench press|overhead press|military press|push press|weighted (pull|chin)-?up/i
    .test(name) && !/dumbbell|\bdb\b|machine|smith/i.test(name)
}

/** Tier from name + catalog (session context applied in repairSession). */
export function classifyTier(ex: Ex, cat?: RulesCatalogEntry | null): Tier {
  const name = str(ex.name)
  if (isWarmup(ex, cat)) return "warmup"
  if (isCardio(ex, cat) || CONDITIONING_NAME_RE.test(name)) return "conditioning"
  if (isPower(ex)) return "power"
  const pattern = classifyPattern(ex, cat)
  if (pattern === "core") return "core"
  if (pattern === "biceps" || pattern === "triceps" || pattern === "carry" || pattern === "other") return "accessory"
  if (ISOLATION_RE.test(name)) return "accessory"
  if (isMainLiftName(name)) return "main_compound"
  return "secondary_compound"
}

// ── Athlete context ────────────────────────────────────────────────────────

type Region = "knee" | "ankle" | "hip" | "back" | "shoulder" | "wrist"

const REGION_WORDS: Array<[Region, string]> = [
  ["knee", "knees?|patell\\w*|acl|mcl|menisc\\w*|jumper'?s knee"],
  ["ankle", "ankles?|achilles|shin ?splints?|plantar|feet|foot"],
  ["hip", "hips?|groin|labrum|si joint"],
  ["back", "back|spine|spinal|lumbar|discs?|sciatica|herniat\\w*"],
  ["shoulder", "shoulders?|rotator|labral|ac joint"],
  ["wrist", "wrists?|elbows?|tennis elbow|golfer'?s elbow"],
]
const ALL_REGIONS: Region[] = ["knee", "ankle", "hip", "back", "shoulder", "wrist"]
const TAG_REGIONS: Record<string, Region[]> = {
  high_knee_strain: ["knee"],
  high_lower_back_load: ["back"],
  high_shoulder_strain: ["shoulder"],
  high_wrist_strain: ["wrist"],
}

/** Body regions flagged in free text ("no knee issues" is not a flag). */
export function painRegionsFromText(text: string): Set<Region> {
  const out = new Set<Region>()
  const t = text.toLowerCase()
  if (!t.trim() || /^\s*(none|no|n\/?a|nothing|nope)\.?\s*$/.test(t)) return out
  if (/\b(arthritis|joint pain|joints? hurt|hypermobil\w*|osteopor\w*)\b/.test(t)) {
    ALL_REGIONS.forEach((r) => out.add(r))
  }
  for (const [region, words] of REGION_WORDS) {
    const re = new RegExp(`\\b(${words})\\b`, "g")
    let m: RegExpExecArray | null
    while ((m = re.exec(t)) !== null) {
      const before = t.slice(Math.max(0, m.index - 30), m.index)
      if (/\b(no|without|never|not|zero)\b(\s+\S+){0,2}\s*$/.test(before)) continue
      // "back squat" / "back day" are exercises, not a back problem.
      if (region === "back" && /^back\s+(squat|day|row|extension)/.test(t.slice(m.index))) continue
      out.add(region)
      break
    }
  }
  return out
}

function painRegions(ctx: RulesContext): Set<Region> {
  const text = [str(ctx.limitations), str(ctx.additional_notes)].join("\n")
  const regions = painRegionsFromText(text)
  if (Array.isArray(ctx.exercise_performance)) {
    for (const row of ctx.exercise_performance as Ex[]) {
      if (!row || row.pain_flagged !== true) continue
      const tags = Array.isArray(row.contraindication_tags) ? (row.contraindication_tags as string[]) : []
      for (const tag of tags) for (const r of TAG_REGIONS[tag] ?? []) regions.add(r)
      painRegionsFromText(`${str(row.name)} ${str(row.pain_note)}`).forEach((r) => regions.add(r))
    }
  }
  return regions
}

function powerRegions(ex: Ex, pattern: Pattern): Region[] {
  if (OLYMPIC_RE.test(str(ex.name))) return ["back", "knee", "wrist", "shoulder"]
  if (pattern === "squat" || pattern === "hinge" || pattern === "lunge") {
    return ["knee", "ankle", "hip", "back"]
  }
  if (pattern === "core") return ["back", "shoulder"]
  return ["shoulder", "wrist"]
}

/** Exercises the athlete swapped in / added themselves — never dropped. */
function protectedNames(ctx: RulesContext): Set<string> {
  const out = new Set<string>()
  if (Array.isArray(ctx.exercise_performance)) {
    for (const row of ctx.exercise_performance as Ex[]) {
      if (row && Array.isArray(row.athlete_edits) && row.athlete_edits.length > 0) {
        out.add(looseKey(str(row.name)))
      }
    }
  }
  const prior = ctx.prior_week_program as Ex | Ex[] | null | undefined
  const days: Ex[] = Array.isArray(prior)
    ? prior
    : Array.isArray((prior as Ex | null)?.days)
      ? ((prior as Ex).days as Ex[])
      : []
  for (const day of days) {
    for (const ex of (Array.isArray(day?.exercises) ? day.exercises : []) as Ex[]) {
      if (ex && ex.athlete_edit) out.add(looseKey(str(ex.name)))
    }
  }
  return out
}

const EQUIPMENT_BY_ACCESS: Record<string, string[]> = {
  "commercial gym": ["barbell", "dumbbell", "bodyweight", "machine", "cable", "kettlebell", "bands", "bike", "pool", "rower"],
  "home gym": ["barbell", "dumbbell", "bodyweight", "kettlebell", "bands", "bike", "rower"],
  "dumbbells only": ["dumbbell", "bodyweight", "bands", "kettlebell"],
  "bodyweight only": ["bodyweight"],
}

function allowedEquipment(equipment: unknown): Set<string> {
  const key = str(equipment).toLowerCase().trim()
  return new Set(EQUIPMENT_BY_ACCESS[key] ?? ["bodyweight"])
}

/** Why plyometrics don't fit this athlete (null = they do). */
export function plyoBlockReason(ctx: RulesContext): string | null {
  if (/beginner|novice/i.test(str(ctx.experience_level))) return "beginner"
  if (/hypertrophy/i.test(str(ctx.goal))) return "hypertrophy goal"
  return null
}

// ── Session repair ─────────────────────────────────────────────────────────

type Item = {
  ex: Ex
  name: string
  orig: number
  tier: Tier
  pattern: Pattern
  labelledPair: boolean
  protected: boolean
}

type SessionCtx = {
  plyoBlock: string | null
  pain: Set<Region>
  protectedNames: Set<string>
  catalog: RulesCatalogEntry[]
  catalogByKey: Map<string, RulesCatalogEntry>
  equipment: Set<string>
}

function strengthCount(items: Item[]): number {
  return items.filter(
    (i) =>
      i.pattern !== "cardio" &&
      i.tier !== "warmup" &&
      i.tier !== "conditioning" &&
      i.tier !== "core",
  ).length
}

function makeReplacement(from: Item, cat: RulesCatalogEntry, tier: Tier, pattern: Pattern): Item {
  const sets = Math.min(Math.max(Number(from.ex.sets) || 3, 2), 3)
  const ex: Ex = {
    name: cat.name,
    modality: "strength",
    sets,
    reps: "8-10",
    weight_guidance: "moderate, RPE 7",
    notes: "",
    target_duration_seconds: null,
    target_distance: null,
    distance_unit: null,
    is_interval: false,
    target_splits: null,
  }
  return {
    ex,
    name: cat.name,
    orig: from.orig,
    tier,
    pattern,
    labelledPair: false,
    protected: false,
  }
}

/** A catalog strength exercise of one of `patterns` that fits, or null. */
function findAlternative(
  patterns: Pattern[],
  items: Item[],
  ctx: SessionCtx,
  exclude: Set<string>,
): { cat: RulesCatalogEntry; pattern: Pattern } | null {
  const inSession = new Set(items.map((i) => looseKey(i.name)))
  for (const pattern of patterns) {
    const candidates = ctx.catalog.filter((c) => {
      if (!c || typeof c.name !== "string" || c.modality === "cardio") return false
      const key = looseKey(c.name)
      if (inSession.has(key) || exclude.has(key)) return false
      const asEx: Ex = { name: c.name, modality: "strength" }
      if (isPower(asEx) || isWarmup(asEx, c)) return false
      if (classifyPattern(asEx, c) !== pattern) return false
      const tier = classifyTier(asEx, c)
      if (tier !== "secondary_compound" && tier !== "accessory") return false
      const equip = str(c.equipment_required).toLowerCase() || "bodyweight"
      if (!ctx.equipment.has(equip)) return false
      const tags = Array.isArray(c.contraindication_tags) ? c.contraindication_tags : []
      if (tags.some((t) => (TAG_REGIONS[t] ?? []).some((r) => ctx.pain.has(r)))) return false
      return true
    })
    candidates.sort(
      (a, b) => (a.contraindication_tags?.length ?? 0) - (b.contraindication_tags?.length ?? 0),
    )
    if (candidates[0]) return { cat: candidates[0], pattern }
  }
  return null
}

function countPattern(items: Item[], pattern: Pattern): number {
  return items.filter((i) => i.pattern === pattern).length
}

/**
 * Greedy interleave: keep the original order unless the next item would
 * repeat the previous pattern and a later item in the same group would not.
 */
function interleave(group: Item[], prevPattern: Pattern | null): Item[] {
  const rest = [...group]
  const out: Item[] = []
  let last = prevPattern
  while (rest.length) {
    let idx = rest.findIndex(
      (i) => i.labelledPair || last == null || i.pattern !== last || !CAPPED_PATTERNS.has(i.pattern),
    )
    if (idx === -1) idx = 0
    const [picked] = rest.splice(idx, 1)
    out.push(picked)
    last = picked.pattern
  }
  return out
}

function repairSession(
  exercises: Ex[],
  ctx: SessionCtx,
  dayLabel: string,
  fixes: string[],
): { exercises: Ex[]; shortfall: string | null } {
  let items: Item[] = exercises.map((ex, orig) => {
    const cat = ctx.catalogByKey.get(looseKey(str(ex.name))) ?? null
    return {
      ex,
      name: str(ex.name),
      orig,
      tier: classifyTier(ex, cat),
      pattern: classifyPattern(ex, cat),
      labelledPair: /superset|contrast|complex|paired with|circuit/i.test(str(ex.notes)),
      protected: ctx.protectedNames.has(looseKey(str(ex.name))),
    }
  })
  const strengthBefore = strengthCount(items)
  const dropped = new Set<string>()

  // Cardio the model put before any lifting is the day's key session (run-led
  // day); cardio after the lifting is conditioning and goes last.
  const firstLift = items.find((i) => i.tier !== "warmup" && i.pattern !== "cardio")
  for (const i of items) {
    if (i.tier === "conditioning" && i.pattern === "cardio" && (!firstLift || i.orig < firstLift.orig)) {
      i.tier = "main_compound"
    }
  }

  // One heavy main lift per pattern; later same-pattern mains become secondary.
  const mainSeen = new Set<Pattern>()
  for (const i of items) {
    if (i.tier !== "main_compound" || i.pattern === "cardio") continue
    if (mainSeen.has(i.pattern)) i.tier = "secondary_compound"
    mainSeen.add(i.pattern)
  }

  // Plyometrics that don't fit this athlete.
  items = items.flatMap((i) => {
    if (i.tier !== "power" || i.protected) return [i]
    const painHit = powerRegions(i.ex, i.pattern).filter((r) => ctx.pain.has(r))
    const reason = ctx.plyoBlock ?? (painHit.length ? `${painHit.join("/")} pain flag` : null)
    if (!reason) return [i]
    dropped.add(looseKey(i.name))
    const others = items.filter((o) => o !== i)
    if (CAPPED_PATTERNS.has(i.pattern) && countPattern(others, i.pattern) < MAX_SAME_PATTERN) {
      const alt = findAlternative([i.pattern], others, ctx, dropped)
      if (alt) {
        fixes.push(`${dayLabel}: Replaced ${i.name} with ${alt.cat.name} (plyometric not suited: ${reason})`)
        return [makeReplacement(i, alt.cat, "accessory", alt.pattern)]
      }
    }
    fixes.push(`${dayLabel}: Removed ${i.name} (plyometric not suited: ${reason})`)
    return []
  })

  // Power work that stays is low volume: ≤4 sets of ≤5 reps.
  items = items.map((i) => {
    if (i.tier !== "power" || i.protected) return i
    const reps = parseInt(str(i.ex.reps), 10)
    const sets = Number(i.ex.sets)
    const tooManyReps = Number.isFinite(reps) && reps > MAX_POWER_REPS
    const tooManySets = Number.isFinite(sets) && sets > MAX_POWER_SETS
    if (!tooManyReps && !tooManySets) return i
    fixes.push(`${dayLabel}: Cut ${i.name} to ${tooManySets ? MAX_POWER_SETS : sets}×${tooManyReps ? MAX_POWER_REPS : str(i.ex.reps)} (power work stays low volume)`)
    return {
      ...i,
      ex: {
        ...i.ex,
        ...(tooManyReps ? { reps: String(MAX_POWER_REPS) } : {}),
        ...(tooManySets ? { sets: MAX_POWER_SETS } : {}),
      },
    }
  })

  // Pattern budget: at most MAX_SAME_PATTERN per pattern.
  for (const pattern of CAPPED_PATTERNS) {
    const same = items.filter((i) => i.pattern === pattern)
    if (same.length <= MAX_SAME_PATTERN) continue
    const keep = [...same]
      .sort(
        (a, b) =>
          Number(b.protected) - Number(a.protected) ||
          KEEP_PRIORITY[a.tier] - KEEP_PRIORITY[b.tier] ||
          a.orig - b.orig,
      )
      .slice(0, MAX_SAME_PATTERN)
    const extras = same.filter((i) => !keep.includes(i) && !i.protected)
    for (const extra of extras) {
      dropped.add(looseKey(extra.name))
      const others = items.filter((o) => o !== extra)
      const group = REGION_GROUPS.find((g) => g.includes(pattern))
      const open = (group ?? []).filter((p) => p !== pattern && countPattern(others, p) === 0)
      const alt = open.length ? findAlternative(open, others, ctx, dropped) : null
      const label = PATTERN_LABEL[pattern]
      if (alt) {
        fixes.push(
          `${dayLabel}: Replaced ${extra.name} with ${alt.cat.name} (max ${MAX_SAME_PATTERN} ${label} exercises; adds ${PATTERN_LABEL[alt.pattern]})`,
        )
        const rep = makeReplacement(extra, alt.cat, "accessory", alt.pattern)
        items = items.map((o) => (o === extra ? rep : o))
      } else {
        fixes.push(`${dayLabel}: Removed ${extra.name} (max ${MAX_SAME_PATTERN} ${label} exercises per session)`)
        items = others
      }
    }
  }

  // Coach order: stable sort by tier, then interleave secondary + accessory.
  const byTier = new Map<Tier, Item[]>()
  for (const i of items) {
    const list = byTier.get(i.tier) ?? []
    list.push(i)
    byTier.set(i.tier, list)
  }
  const ordered: Item[] = []
  for (const tier of Object.keys(TIER_RANK) as Tier[]) {
    const group = (byTier.get(tier) ?? []).sort((a, b) => a.orig - b.orig)
    const prev = ordered.length ? ordered[ordered.length - 1].pattern : null
    const placed =
      tier === "secondary_compound" || tier === "accessory" ? interleave(group, prev) : group
    ordered.push(...placed)
  }

  // Describe moves: X now precedes an item that originally came before it.
  ordered.forEach((item, pos) => {
    const passed = ordered.slice(pos + 1).find((later) => later.orig < item.orig)
    if (!passed) return
    const why =
      TIER_RANK[item.tier] < TIER_RANK[passed.tier]
        ? item.tier === "power"
          ? "power work goes first, while fresh"
          : `${item.tier.replace("_", " ")} before ${passed.tier.replace("_", " ")}`
        : `avoid back-to-back ${PATTERN_LABEL[passed.pattern]}`
    fixes.push(`${dayLabel}: Moved ${item.name} before ${passed.name} (${why})`)
  })

  const strengthAfter = strengthCount(ordered)
  const shortfall =
    strengthBefore >= MIN_STRENGTH_EXERCISES && strengthAfter < MIN_STRENGTH_EXERCISES
      ? `${dayLabel}: only ${strengthAfter} strength exercise(s) left after removing rule violations; use more distinct movement patterns`
      : null

  return { exercises: ordered.map((i) => i.ex), shortfall }
}

/**
 * Repair every day of `program` in place-safe fashion (returns a new program
 * object; the input is not mutated).
 */
export function repairProgram(
  program: Record<string, unknown>,
  catalog: RulesCatalogEntry[],
  context: RulesContext = {},
): RepairResult {
  const fixes: string[] = []
  const shortfalls: string[] = []
  const cat = (Array.isArray(catalog) ? catalog : []).filter(
    (c) => c && typeof c.name === "string",
  )
  const ctx: SessionCtx = {
    plyoBlock: plyoBlockReason(context),
    pain: painRegions(context),
    protectedNames: protectedNames(context),
    catalog: cat,
    catalogByKey: new Map(cat.map((c) => [looseKey(c.name), c])),
    equipment: allowedEquipment(context.equipment),
  }
  const weeks = Array.isArray(program?.weeks) ? (program.weeks as Ex[]) : []
  const newWeeks = weeks.map((week) => {
    const days = Array.isArray(week?.days) ? (week.days as Ex[]) : []
    return {
      ...week,
      days: days.map((day) => {
        const exercises = Array.isArray(day?.exercises) ? (day.exercises as Ex[]) : []
        if (!exercises.length) return day
        const label = `Day ${str(day.day_number) || "?"}`
        const res = repairSession(exercises, ctx, label, fixes)
        if (res.shortfall) shortfalls.push(res.shortfall)
        return { ...day, exercises: res.exercises }
      }),
    }
  })
  return { program: { ...program, weeks: newWeeks }, fixes, shortfalls }
}
