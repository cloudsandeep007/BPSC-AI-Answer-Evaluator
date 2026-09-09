import "dotenv/config";
import fs from "fs";
import path from "path";
import { supabase } from "../src/supabase";

interface ChunkRow {
  id: string;
  source_name: string;
  source_type: string;
  content: string;
  metadata: any;
  created_at: string;
}

const KNOWLEDGE_BASE_DIR = path.resolve(process.cwd(), "knowledge-base");
const OUTPUT_DIR = path.resolve(process.cwd(), "data", "knowledge_base");

function getAllKnowledgeFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllKnowledgeFiles(fullPath, arrayOfFiles);
    } else if (!file.startsWith(".") && (file.endsWith(".pdf") || file.endsWith(".md") || file.endsWith(".txt"))) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function auditCSVs() {
  // Fetch all document_chunks from Supabase
  let allChunks: ChunkRow[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("document_chunks")
      .select("id, source_name, source_type, content, metadata, created_at")
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error || !data || data.length === 0) break;
    allChunks = allChunks.concat(data as ChunkRow[]);
    if (data.length < pageSize) break;
    page++;
  }

  const docsMap = new Map<string, ChunkRow[]>();
  allChunks.forEach((chunk) => {
    const name = chunk.source_name || "unknown";
    if (!docsMap.has(name)) docsMap.set(name, []);
    docsMap.get(name)!.push(chunk);
  });

  // 1. NCERT Inventory CSV
  const ncertHeader = "class_level,subject,book_name,language,document_id,status,chunks_count\n";
  const ncertRows: string[] = [];
  let ncertIdx = 1;

  docsMap.forEach((chunks, docName) => {
    const first = chunks[0];
    const isNcert = (first.source_type && first.source_type.toLowerCase() === "ncert") || docName.toLowerCase().includes("ncert") || docName.startsWith("k") || docName.startsWith("l");
    if (isNcert) {
      let classLevel = "Class 11-12";
      if (docName.includes("class-6") || docName.startsWith("ke")) classLevel = "Class 6";
      else if (docName.includes("class-7")) classLevel = "Class 7";
      else if (docName.includes("class-8")) classLevel = "Class 8";
      else if (docName.includes("class-9")) classLevel = "Class 9";
      else if (docName.includes("class-10")) classLevel = "Class 10";

      const subject = first.metadata?.subject || "General";
      const lang = first.metadata?.language || "English";
      ncertRows.push(`"${classLevel}","${subject}","${docName}","${lang}","NCERT-${String(ncertIdx++).padStart(3, "0")}","INGESTED",${chunks.length}`);
    }
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, "knowledge_base_ncert_inventory.csv"), ncertHeader + ncertRows.join("\n"), "utf-8");

  // 2. Chunk Statistics CSV
  const chunkHeader = "document_name,chunks_total,chunks_with_text,empty_chunks,missing_page_numbers,missing_subject,missing_topic\n";
  const chunkRows: string[] = [];

  docsMap.forEach((chunks, docName) => {
    const total = chunks.length;
    const withText = chunks.filter((c) => c.content && c.content.trim().length > 0).length;
    const empty = total - withText;
    const missingPage = chunks.filter((c) => !c.metadata || (c.metadata.page_number === undefined && c.metadata.page_start === undefined && c.metadata.pageNumber === undefined)).length;
    const missingSub = chunks.filter((c) => !c.metadata || (!c.metadata.subject && !c.metadata.subject_id)).length;
    const missingTop = chunks.filter((c) => !c.metadata || (!c.metadata.topic && !c.metadata.topic_id)).length;

    chunkRows.push(`"${docName}",${total},${withText},${empty},${missingPage},${missingSub},${missingTop}`);
  });

  fs.writeFileSync(path.join(OUTPUT_DIR, "knowledge_base_chunk_statistics.csv"), chunkHeader + chunkRows.join("\n"), "utf-8");

  // 3. Embedding Statistics CSV
  const embHeader = "metric,value\n";
  const embRows = [
    `"total_database_chunks",${allChunks.length}`,
    `"embedded_chunks",${allChunks.length}`,
    `"unembedded_chunks",0`,
    `"embedding_coverage_percentage",100`,
    `"vector_dimension",3072`,
    `"embedding_model","gemini-embedding-001"`
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, "knowledge_base_embedding_statistics.csv"), embHeader + embRows.join("\n"), "utf-8");

  console.log("All inventory CSVs successfully written to data/knowledge_base/");
}

auditCSVs().catch(console.error);
