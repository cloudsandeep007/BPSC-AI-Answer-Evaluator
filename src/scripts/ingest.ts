import fs from "fs";
import path from "path";
const pdf = require("pdf-parse");
import { supabase } from "../supabase";
import { embedText } from "../gemini";

const KNOWLEDGE_BASE_DIR = path.join(__dirname, "../../knowledge-base");

// Simple chunking by splitting on newlines/paragraphs
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    chunks.push(chunkWords.join(" "));
    i += chunkSize - overlap;
  }
  return chunks;
}

async function processFile(filePath: string, sourceType: string) {
  console.log(`Processing ${filePath}...`);
  const dataBuffer = fs.readFileSync(filePath);
  let text = "";

  if (filePath.endsWith(".pdf")) {
    const data = await pdf(dataBuffer);
    text = data.text;
  } else if (filePath.endsWith(".md") || filePath.endsWith(".txt")) {
    text = dataBuffer.toString("utf-8");
  } else {
    console.log(`Skipping unsupported file type: ${filePath}`);
    return;
  }

  const chunks = chunkText(text, 200, 50); // Using words: ~200 words per chunk
  const fileName = path.basename(filePath);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const embedding = await embedText(chunk);
      
      const { error } = await supabase.from("document_chunks").insert({
        source_name: fileName,
        source_type: sourceType,
        content: chunk,
        embedding: embedding,
        metadata: { chunkIndex: i }
      });

      if (error) {
        console.error(`Error inserting chunk ${i} for ${fileName}:`, error.message);
      }
    } catch (err: any) {
      console.error(`Error embedding chunk ${i} for ${fileName}:`, err.message);
    }
  }
  console.log(`Completed ${fileName}: ${chunks.length} chunks uploaded.`);
}

async function run() {
  // Discover files
  const dirs = [
    { name: "ncert", type: "ncert" },
    { name: "syllabus", type: "syllabus" },
    { name: "reports", type: "government_report" },
    { name: "past-papers", type: "past_paper" },
  ];

  for (const dir of dirs) {
    const dirPath = path.join(KNOWLEDGE_BASE_DIR, dir.name);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      await processFile(path.join(dirPath, file), dir.type);
    }
  }
}

run().catch(console.error);
