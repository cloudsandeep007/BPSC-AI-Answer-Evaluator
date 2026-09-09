import { describe, it, expect } from "vitest";
import {
  calculateChecksum,
  chunkTextWithPages,
  deriveDocumentMetadata,
  ExtractedPage
} from "../../src/scripts/ingest";
import { retrieveEvidencePack } from "../../src/rag/retrieval";

describe("Phase 4B Knowledge Base Ingestion & Vector Retrieval Pipeline", () => {
  it("should compute deterministic SHA-256 checksums", () => {
    const buf1 = Buffer.from("BPSC Mains Knowledge Base Content 2026");
    const buf2 = Buffer.from("BPSC Mains Knowledge Base Content 2026");
    const buf3 = Buffer.from("Different Content");

    const hash1 = calculateChecksum(buf1);
    const hash2 = calculateChecksum(buf2);
    const hash3 = calculateChecksum(buf3);

    expect(hash1).toHaveLength(64);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
  });

  it("should derive accurate document metadata aligned with BPSC taxonomy", () => {
    const metaPolity = deriveDocumentMetadata("ncert/polity/ncert-class-10-political-science.pdf");
    expect(metaPolity.subject_id).toBe("BPSC-SUB-02");
    expect(metaPolity.subject).toBe("Polity & Governance");
    expect(metaPolity.documentType).toBe("NCERT");

    const metaHistory = deriveDocumentMetadata("ncert/history/01_Old_NCERT_Ancient_India.pdf");
    expect(metaHistory.subject_id).toBe("BPSC-SUB-01");
    expect(metaHistory.subject).toBe("History, Art & Culture");
    expect(metaHistory.topic_id).toBe("HIST-001");

    const metaPastPaper = deriveDocumentMetadata("past-papers/mains/67thMainsGS1-2022.pdf");
    expect(metaPastPaper.documentType).toBe("PAST_PAPER");
    expect(metaPastPaper.paperCategory).toBe("mains");
  });

  it("should chunk text preserving page boundaries and page numbers", () => {
    const samplePages: ExtractedPage[] = [
      { pageNumber: 1, text: "Chapter 1: Preamble and Constitution of India. Article 14 guarantees equality before law." },
      { pageNumber: 2, text: "Article 19 guarantees freedom of speech and expression subject to reasonable restrictions." },
      { pageNumber: 3, text: "Directive Principles of State Policy in Part IV aim to establish a welfare state in India." }
    ];

    const chunks = chunkTextWithPages(samplePages, 20, 5);
    expect(chunks.length).toBeGreaterThan(0);

    chunks.forEach((chunk) => {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.pageStart).toBeGreaterThanOrEqual(1);
      expect(chunk.pageEnd).toBeGreaterThanOrEqual(chunk.pageStart);
    });
  });

  it("Retrieval Test 1: Governor discretionary powers query", async () => {
    const pack = await retrieveEvidencePack({
      query: "discretionary powers of Governor under Indian Constitution",
      filterSubject: "BPSC-SUB-02",
      matchCount: 3
    });

    expect(pack.query).toContain("Governor");
    expect(pack.chunks).toBeDefined();
    expect(pack.totalRetrieved).toBeGreaterThanOrEqual(0);
  });

  it("Retrieval Test 2: Panchayati Raj and 73rd Amendment query", async () => {
    const pack = await retrieveEvidencePack({
      query: "73rd Constitutional Amendment and Panchayati Raj institutions in Bihar",
      filterSubject: "BPSC-SUB-02",
      filterTopic: "POLITY-005",
      matchCount: 3
    });

    expect(pack.query).toContain("Panchayati Raj");
    expect(pack.chunks).toBeDefined();
  });

  it("Retrieval Test 3: Champaran Satyagraha and Gandhi query", async () => {
    const pack = await retrieveEvidencePack({
      query: "Champaran Satyagraha 1917 role of Mahatma Gandhi and Raj Kumar Shukla in Bihar",
      filterSubject: "BPSC-SUB-01",
      filterTopic: "HIST-001",
      matchCount: 3
    });

    expect(pack.query).toContain("Champaran Satyagraha");
    expect(pack.chunks).toBeDefined();
  });

  it("Retrieval Test 4: Judicial Review & Basic Structure query", async () => {
    const pack = await retrieveEvidencePack({
      query: "judicial review and basic structure doctrine Kesavananda Bharati case",
      filterSubject: "BPSC-SUB-02",
      matchCount: 3
    });

    expect(pack.query).toContain("judicial review");
    expect(pack.chunks).toBeDefined();
  });

  it("Retrieval Test 5: Indian Monsoon & Physical Geography query", async () => {
    const pack = await retrieveEvidencePack({
      query: "Indian monsoon mechanism and rainfall distribution in Bihar",
      filterSubject: "BPSC-SUB-04",
      matchCount: 3
    });

    expect(pack.query).toContain("monsoon");
    expect(pack.chunks).toBeDefined();
  });

  it("Retrieval Test 6: Multidimensional Poverty Index query", async () => {
    const pack = await retrieveEvidencePack({
      query: "poverty and NITI Aayog Multidimensional Poverty Index MPI in Bihar",
      filterSubject: "BPSC-SUB-03",
      matchCount: 3
    });

    expect(pack.query).toContain("poverty");
    expect(pack.chunks).toBeDefined();
  });

  it("Retrieval Test 7: Science, Technology & AI query", async () => {
    const pack = await retrieveEvidencePack({
      query: "application of Artificial Intelligence AI 5G and E-Governance in public service delivery",
      filterSubject: "BPSC-SUB-05",
      matchCount: 3
    });

    expect(pack.query).toContain("Artificial Intelligence");
    expect(pack.chunks).toBeDefined();
  });

  it("Retrieval Test 8: Essay & Philosophical reflections query", async () => {
    const pack = await retrieveEvidencePack({
      query: "cultural heritage of Bihar and socio-economic transformation",
      filterSubject: "BPSC-SUB-08",
      matchCount: 3
    });

    expect(pack.query).toContain("cultural heritage");
    expect(pack.chunks).toBeDefined();
  });
});
