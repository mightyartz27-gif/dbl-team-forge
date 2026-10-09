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

## Rating Match (PvP) tiers
- Source: the official "Newest Rating Match Tier List" notice, mirrored on dblegends.net news. The newest post is found automatically (daily workflow); if parsing fails, the previous list is kept.
- Tiers are a balancing system: bonuses are based on usage, so heavily used units sit in lower tiers. Tier C gets nothing.
- In Rating Match mode each **fighter** gets its tier's Inflicted Damage UP (direct layer, like Damage Inflicted) and Damage Guard UP. Zenkai Awakened characters get the smaller "after Zenkai" values; units that can't be awakened always get the "before" values.
- Featured LEGENDS LIMITED units also get the LL-exclusive base bonus (Health, Strike/Blast ATK and DEF, Critical) for the star band you select.
- Bench members get no tier bonus, so the tier filter applies to fighters only; the bench is still chosen for its Z Abilities.
- Characters missing from the published list ("not all characters are listed") are shown as *Not listed* and get no bonus in the math.
- Effective defense combines DEF with Damage Guard multiplicatively — an approximation, since the exact in-game formula isn't published.
- Stats reward high tier bonuses, but kit quality (cards, disruption, counters) isn't quantifiable: lock trusted units or filter fighter rarity.

## Not calculated (listed separately)
Power Resonance (triggers at battle start), battle traits (counters, cover changes…), card-draw and Arts-cost effects, and any ability text the parser couldn't read with confidence (0.3% of Z Ability levels in the Sept 2026 database).

## Analysis options (Build and Team share them)
- **Defense coverage** (Both / Strike / Blast): which DEF the weights and the defense component value. Effective defense combines DEF with Damage Guard.
- **Team balance** (carry ↔ balanced): every per-fighter component is `(1 − f) × average + f × weakest fighter`; default f = 15%.
- **Style cohesion**: each fighter has a Strike/Blast lean — a clear base-stat lean (>8%) first, otherwise the Strike vs Blast boosts written in its main + unique abilities, otherwise Mixed. Cohesion = share of its received ATK buffs (Z, Zenkai, equipment, tier) on its own side (Mixed units want both sides equal). Exact per-character Strike/Blast card counts are not in public open data, so card counts are not used.
- **Scan depth**: Thorough widens the fighter candidate list (≈1.6×) and fully evaluates twice as many teams.
- **Ability Bonus**: per fighter, the sum of HP, Strike/Blast ATK, Strike/Blast DEF, Damage, Damage Guard and Ki bonuses from every source and layer; the team figure adds up the fighters. Grade (S+…D) is a band of the optimizer score.

## My box and Zenkai
- Owned Zenkai-capable characters are counted without their Zenkai Z Ability unless marked as Zenkai Awakened in the box. That also gives them the larger pre-Zenkai PvP tier bonus. Characters not in the box are assumed fully awakened.

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
