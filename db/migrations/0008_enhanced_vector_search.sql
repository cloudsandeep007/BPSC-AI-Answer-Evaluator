-- 0008_enhanced_vector_search.sql
-- Phase 4B: Additive Migration for Knowledge Base Vector Search & Filtering

-- Enhance match_document_chunks stored procedure to support optional subject and topic metadata filtering
CREATE OR REPLACE FUNCTION match_document_chunks (
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  filter_topic text DEFAULT NULL,
  filter_subject text DEFAULT NULL
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
  WHERE (1 - (document_chunks.embedding <=> query_embedding)) > match_threshold
    AND (
      filter_topic IS NULL 
      OR document_chunks.metadata->>'topic' = filter_topic 
      OR document_chunks.metadata->>'topic_id' = filter_topic
    )
    AND (
      filter_subject IS NULL 
      OR document_chunks.metadata->>'subject' = filter_subject 
      OR document_chunks.metadata->>'subject_id' = filter_subject
    )
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
$$;
