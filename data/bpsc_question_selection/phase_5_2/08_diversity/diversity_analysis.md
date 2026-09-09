# Diversity Factor Operational Analysis

## Diagnostic Findings
1. `diversity_score` is NOT stuck at 0.50. It evaluates to:
   - **1.00** when candidate topic has 0 recent student exposures in history.
   - **0.70** when another topic was practiced last.
   - **0.20** when candidate topic was the exact topic practiced in the immediately preceding iteration (`lastTopicPracticed === stats.topic_id`).
2. This 0.80 score gap between recent vs unpracticed topics creates effective anti-repetition topic switching.
