# Incident Investigation SIF / pSIF Model

Safety Secretary treats incident investigation as a prevention loop, not as an
injury-counting workflow. The core rule is:

> Record the actual outcome and the credible worst realistic potential outcome
> separately.

This follows modern SIF / pSIF thinking. NSC describes SIFs as serious
incidents and fatalities, and pSIFs as near misses or lower-severity incidents
that could have become a SIF if one or two factors had changed:
https://www.nsc.org/workplace/sif-prevention-model

The older accident-pyramid idea is useful only as a reminder that many weak
signals precede serious events. It must not drive the data model by assuming
minor actual harm means minor risk. A scratched person hit by a truck can have
an actual outcome of First aid while the credible potential severity is Death.

## Core Fields

- **Incident type** is the event category: Near miss, Accident, or Property
  damage.
- **Actual injury outcome** is factual harm. It uses No injury or the same
  injury-outcome language as the A-E severity taxonomy: First aid, Medical
  treatment, Lost time injury, Irreversible injury, Death. Unknown is allowed
  while facts are incomplete.
- **Potential outcome** is a short narrative of the credible worst realistic
  outcome.
- **Potential severity** uses the default A-E severity taxonomy.
- **Potential likelihood** uses the default 1-5 likelihood taxonomy. Estimate
  it by imagining 1000 people doing the same task under similar conditions.
- **Potential risk** is computed from potential severity x potential
  likelihood using the configured risk matrix.

## Investigation Priority

Investigation depth is driven by potential risk, not only by actual injury.

- High potential risk or potential severity A/B should trigger a serious
  investigation posture and HIRA follow-up consideration, even if actual harm
  was low.
- Low actual harm does not downgrade the investigation when the potential
  outcome was severe.
- The system must not infer potential severity from actual injury outcome; the
  user records both.

## Configuration Direction

The default matrix is Safety Secretary's Swiss-pragmatic default, but companies
may later customize risk-band names, matrix size, zone colours, and thresholds.
That customization changes the matrix display and computed risk band. It does
not remove the SIF/pSIF split between actual outcome and potential outcome.
