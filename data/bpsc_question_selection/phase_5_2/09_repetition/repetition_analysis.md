# Repetition Penalty Dynamics Analysis

## Penalty Activation Function
- **1 Practice**: `-0.15` penalty + `0.70` exposure score (Net reduction: `-0.45` points).
- **2 Practices**: `-0.30` penalty + `0.40` exposure score (Net reduction: `-0.90` points).
- **3+ Practices**: `-0.50` max penalty + `0.10` exposure score (Net reduction: `-1.40` points).

This non-linear penalty curve guarantees that 3 repeated practices will drop any top-ranked topic below all alternative candidates in the subject.
