# Recency Factor Impact Analysis

## Observation
- When Panchayati Raj was practiced 1 iteration ago (History B), `diversity_score` for Panchayati Raj drops from 1.0 to **0.20**, triggering topic rotation.
- When Panchayati Raj was practiced 10 iterations ago (History A), `diversity_score` resets to **1.0**, allowing Panchayati Raj to re-enter candidate competitiveness.
- **Conclusion**: Recency decay operates as designed without hard-banning older topics.
