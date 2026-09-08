-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the table for storing document chunks
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT NOT NULL,          -- e.g., 'ncert_history_class_11.pdf'
    source_type TEXT NOT NULL,          -- e.g., 'ncert', 'syllabus', 'past_paper', 'government_report'
    content TEXT NOT NULL,              -- The actual paragraph/chunk text
    embedding vector(3072) NOT NULL,     -- The vector representation (3072 for gemini-embedding-001)
    metadata JSONB DEFAULT '{}'::jsonb, -- Any extra data like page numbers or year
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Create an index to speed up similarity search
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Create a function to search for document chunks
CREATE OR REPLACE FUNCTION match_document_chunks (
  query_embedding vector(3072),
  match_threshold float,
  match_count int,
  filter_topic text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_name text,
  source_type text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    document_chunks.id,
    document_chunks.source_name,
    document_chunks.source_type,
    document_chunks.content,
    document_chunks.metadata,
    1 - (document_chunks.embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
$$;
