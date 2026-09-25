# Calculation methodology

Mechanics follow the rules documented by DBL Optimizer's public guides (Z Abilities, equipment, FAQ), re-implemented independently. Everything below is covered by `tests/engine.test.ts` or visible in the UI.

## Z Abilities
- Each character contributes its Z Ability at the chosen level (I–IV). Levels don't stack: the reached level's text is complete.
- Zenkai Awakened characters also contribute their Zenkai Z Ability, counted at its maximum level.
- Every line is checked against each recipient separately. Conditions are OR-of-AND groups of tags (`"both A and B"` = one character must carry both).
- **Leader as receiver**: gets every Z and Zenkai Z Ability line unconditionally.
- **Leader as giver**: its own Z Ability applies unconditionally to its two trio mates; other recipients still need the condition. Its Zenkai Z Ability keeps its condition.
- **Assault Z Abilities** (newer LL cards): active only while the carrier is a battle member, applied to its allies.
- Z coverage for a fighter = value received ÷ value it would receive if every line applied.

## Equipment
- Compatibility comes from the source's equippable-character list, so card-exclusive pieces are enforced exactly.
- Condition types: wearer must have the tag; threshold in the wearer's trio (wearer included); "another/other than this character" (wearer excluded); both tags on one character; any-combination counts; per-member scaling; same-equipment scaling across the team.
- Values default to the maximum roll. Users can pick the OR option they rolled and enter the actual value.
- Matchup effects (damage *to* Saiyans, defense *against* X), Ki restoration, drops and other situational lines are listed as not calculated.

## Stat layers
- Base: "Base …" lines and Z Abilities. Pure: equipment lines without "base" (Strike ATK, Critical…). Direct: Damage Inflicted and move-specific damage.
- Final gain = (1 + base) × (1 + pure) × (1 + direct) − 1. Same layer adds, different layers multiply.
- "Effective Strike/Blast output" combines the ATK stat with Damage Inflicted.

## Not calculated (listed separately)
Power Resonance (triggers at battle start), battle traits (counters, cover changes…), card-draw and Arts-cost effects, and any ability text the parser couldn't read with confidence (0.3% of Z Ability levels in the Sept 2026 database).

## Optimization score
An internal metric, not a game value. Ten components on 0–100, each shown in the app: battle synergy (shared class/Episode/character tags among fighters), Z efficiency, Zenkai efficiency, Health support, offense, defense, equipment, Z coverage, Leader efficiency, locked-character coverage. Components use a saturating curve so differences near the top still count. Weights per priority live in `src/engine/weights.ts`. A penalty applies for Z Abilities that reach no fighter (bench Assault abilities excepted — they are inherently inactive and reported as info).

## Search
1. Pre-weight every candidate's ability lines for the chosen priority and attack type.
2. Keep the characters with the best mutual Z affinity to the locked core (90 / 42 / 22 candidates for 1 / 2 / 3 open fighter slots).
3. Enumerate trios × Leader. For a fixed trio and Leader, bench contributions are additive, so the top-3 marginal bench is exact.
4. Fully evaluate the shortlist with optimized equipment and rank by score.

## Assumptions to verify in game
- Whether "allies" in Assault Z Abilities includes the carrier (currently: excluded).
- Whether the Leader-as-receiver privilege also covers Zenkai Z Abilities (currently: yes).
- `+X% to damage inflicted to "Element: Y"` is read as Y characters' Damage Inflicted.
- Stat-type orientation (Strike vs Blast) is inferred from max base stats, not from the kit.
