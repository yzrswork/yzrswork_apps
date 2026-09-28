# Tool UI/UX Gate v0.2

Use this checklist when reviewing a decision-support tool, especially one with a purchase path. It is a review aid, independent of the `/note` canonical policy.

v0.2 keeps the v0.1 review model and adds two portability rules: progressive detail for mixed-skill audiences, and purchase-path wording that does not require every tool to have a shopping list.

## Checklist

| Area | Check |
| --- | --- |
| UI | The first screen gives a clear hierarchy without crowding; state changes and selected states are visible; touch targets are easy to hit; labels and controls are consistent; content and actions fit narrow screens without horizontal overflow. Affiliate actions do not visually outrank the decision criteria. |
| UX | A new reader can understand the first useful choice at a glance. Each block supports one decision. Terms and abbreviations are clear on first read or explained before use. The initial path shows only what is needed for the next decision; advanced detail, exceptions, terminology, and rationale are available progressively without blocking the basic path. A beginner can reach a useful result without reading expert detail, while an experienced user can inspect the assumptions and exceptions behind it. Safety guidance is specific to the action. The next action is clear, and “done for now” is valid. |
| Journey | Follow: current state → decision → sibling tool if needed → purchase candidate → destination. The path may end at any point, including DONE/no buy. The sibling tool is optional when the current tool already resolves the need. |
| Affiliate fit | State the judgment and required specifications before any candidate. Product names cannot replace selection criteria. A no-buy choice is valid. Affiliate search or links are destinations after the user explicitly accepts/selects a candidate, not the decision itself. |

## Progressive detail

Prefer **simple first / precise when opened**.

- Do not make beginners read expert-only detail to reach the core result.
- Do not remove necessary decision criteria merely to make the screen shorter.
- Put exceptions, terminology, supporting rationale, and advanced constraints behind a secondary layer when they are not required for the next decision.
- Avoid repeating the same explanation in the main path and the detail layer.
- A compact interface is not automatically a PASS; the information hierarchy must still support a correct decision.

## Finding format

Use only **PASS**, **WARN**, or **FAIL**. For every finding, record exact evidence (screen/state, copy or behavior, and viewport/source as relevant), impact, responsible area, and one bounded correction. Do not score the tool or fail it on a threshold alone. The owner decides subjective choices such as emphasis, tone, and acceptable tradeoffs; reviewers should state the observed effect and let the owner judge them.

## Product and source governance

- A new named product requires an entry in `site/catalog.json` and `ownerReview: approved` before it can be presented as an approved affiliate item.
- Specification-based discovery may use a dynamic Amazon search only after the user explicitly accepts/selects that candidate. If the tool has a shopping list, the destination link appears only after adding the candidate to that list.
- Historical named examples in a tool keep their truthful provenance labels such as “実使用” or “記事で紹介”. Those labels describe provenance; they do not automatically endorse a current model, seller, price, stock, or listing.
- Provenance: Vault WR-07 (2026-09-16 log), PA-01 (2026-09-27 log), and `NOTE Editorial Audit SKILL` with its references. This Gate is independent from the `/note` canonical policy and does not amend it.

## Version note

- v0.1 remains as the frozen first version used for the initial 装備ナビ audit.
- v0.2 is the default Gate for new tool reviews and keeps v0.1 semantics except for the two bounded portability clarifications above.
