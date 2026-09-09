# Historical Frequency vs Student Personalization Tradeoff Analysis

## Empirical Rule Discovered
- **Threshold**: Exactly **2 consecutive student practice attempts** on a high-frequency topic (`HIST-001`, 147 past questions) are required before student personalization anti-repetition penalty overcomes historical frequency advantage.
- At 0 exposures: `HIST-001` wins with score **0.800**.
- At 1 exposure: `HIST-001` score drops to **0.710**, still winning slightly.
- At 2 exposures: `HIST-001` score drops to **0.500**, losing to `HIST-002` (score **0.730**).
