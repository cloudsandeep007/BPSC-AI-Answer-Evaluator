# Dedicated BPSC Polity Topic Analysis Report

**Target Subject**: Polity & Governance (`BPSC-SUB-02`)  
**Total Historical Polity Questions**: 38  
**Report Purpose**: Resolve the Telegram bot Panchayati Raj over-generation issue by analyzing full BPSC Polity topic breakdown.

---

## 1. Key Finding & Root Cause Analysis

> [!IMPORTANT]
> **Panchayati Raj represents ONLY 2 out of 38 Polity questions (5.3%) in the historical BPSC corpus.**
> 
> The bot previously generated Panchayati Raj questions repeatedly because the old generator lacked a data-driven topic index across all 6 Polity topics.

---

## 2. Complete Historical Polity Topic Breakdown

| Topic ID | Topic Name | Historical Question Count | Share of Polity | Years Stated | Short Qs | Long Qs |
|----------|------------|---------------------------|-----------------|--------------|----------|---------|
| `POLITY-001` | **Executive (President & Governor)** | 10 | 26.3% | 2018, 2019, 2020, 2022, 2023, 2024, 2025 | 4 | 6 |
| `POLITY-002` | **Judiciary, Rights & Doctrines** | 9 | 23.7% | 2019, 2020, 2022, 2023, 2024 | 5 | 4 |
| `POLITY-003` | **Federalism & Centre-State Relations** | 4 | 10.5% | 2022, 2023, 2024, 2025 | 2 | 2 |
| `POLITY-004` | **Elections, Preamble & Constitutional Bodies** | 10 | 26.3% | 2018, 2019, 2023, 2024, 2025 | 3 | 7 |
| `POLITY-005` | **Local Self-Government (Panchayati Raj)** | 3 | 7.9% | 2018, 2022, 2025 | 0 | 3 |
| `POLITY-006` | **Parliament & Legislative System** | 2 | 5.3% | 2020, 2023 | 0 | 2 |

---

## 3. Sample Historical Questions per Polity Topic

### 🏛️ `POLITY-001`: Executive (President & Governor)
- **BPSC-Q-000011 (2022)**: *"The President of India is an integral part of Parliament, but exercises executive power on advice." Discuss the constitutional status and powers of the President.*
- **BPSC-Q-000020 (2018)**: *Discuss the powers and actual position of the Governor in Bihar politics.*

### ⚖️ `POLITY-002`: Judiciary, Rights & Doctrines
- **BPSC-Q-000003 (2022)**: *Discuss the concept of Judicial Activism in India. Has the Supreme Court overstepped its jurisdiction in policy matters?*
- **BPSC-Q-000011 (2024)**: *Basic Structure Doctrine: Explain the significance of the Kesavananda Bharati judgment (1973) in safeguarding constitutionalism.*
- **BPSC-Q-000007 (2023)**: *Right to Privacy as a Fundamental Right (Puttaswamy Case 2017) under Article 21.*

### 🤝 `POLITY-003`: Federalism & Centre-State Relations
- **BPSC-Q-000010 (2023)**: *"Cooperative Federalism is the bedrock of Indian democracy, yet competitive friction persists." Examine Centre-State relations...*
- **BPSC-Q-000017 (2024)**: *Critically analyze the Indian federal structure with focus on Centre-State fiscal relations and Governor's role...*

### 🗳️ `POLITY-004`: Elections, Preamble & Constitutional Bodies
- **BPSC-Q-000016 (2024)**: *"Electoral reforms are essential for sustaining vibrant democratic institutions." Discuss major electoral challenges...*
- **BPSC-Q-000022 (2019)**: *Critically examine the role of Election Commission of India in the conduct of free and fair elections.*

### 🏡 `POLITY-005`: Local Self-Government (Panchayati Raj)
- **BPSC-Q-000002 (2022)**: *Critically analyze the working of Panchayati Raj Institutions in Bihar post 73rd Amendment, focusing on women reservation (50%) and financial autonomy.*
- **BPSC-Q-000021 (2018)**: *"Decentralized planning through the strengthening of the Panchayat system is the focus of planning in India..."*

---

## 4. Recommendations for Phase 4 Question Generator

1. **Topic-Weighted Selection**: Implement weighted random sampling across all 6 Polity topics instead of selecting a single topic repeatedly.
2. **Anti-Repetition Window**: Maintain a rolling window of recent question topics per student session so that Panchayati Raj is drawn at most once every 10–15 Polity questions.
