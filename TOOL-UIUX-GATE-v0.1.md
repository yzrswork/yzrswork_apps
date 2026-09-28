# Tool UI/UX Gate v0.1

This is a versioned implementation gate for bounded tool UI/UX changes. It is independent of the `/note` canonical policy and does not replace source, product, safety, or content review.

Each review records one outcome for each section: `PASS`, `WARN`, or `FAIL`. This gate intentionally has no numeric score.

## UI

- Initial information hierarchy is clear.
- State changes and selected states are visible.
- Tap targets are easy to use and remain at least 44px where interaction requires it.
- Labels and operations use consistent wording.
- The tool does not introduce horizontal overflow at its supported narrow widths.

## UX

- The first useful decision is apparent quickly.
- Each block supports one decision.
- Terms are explained before detailed options appear.
- Details are progressive and do not overwhelm the initial path.
- Safety guidance is close to the operation it qualifies.
- The next action is clear, including a normal `DONE` / no-buy outcome.

## Journey

The intended path is:

`current state → decision → sibling tool if needed → purchase candidate → destination`

The user may finish at any point, including `DONE` or no-buy.

## Affiliate Fit

- Judgment criteria appear before product names or destination CTAs.
- A product name is not used as a substitute for selection criteria.
- The user can choose not to buy.
- Amazon is a destination after the candidate decision, not the first decision.

## Product / source governance

- Existing item IDs and state contracts remain stable unless an explicitly approved change says otherwise.
- Historical provenance labels remain truthful: `実使用`, `記事で紹介`, and `仕様候補` are not current price, stock, seller, model, or listing guarantees.
- New named affiliate products require catalog registration and `ownerReview: approved` before publication.
- Generic specification-based candidates must make the required conditions visible before their destination search.
- Analytics, disclosure, generated-file, and source-of-truth boundaries remain intact.
