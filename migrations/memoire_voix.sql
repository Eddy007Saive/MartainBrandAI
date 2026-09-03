-- =====================================================================
-- Mémoire de voix (RAG phase 1) : un vecteur par contenu validé/publié.
-- À la rédaction d'un post/carrousel/script, on retrouve les 3-4 contenus
-- validés du compte les plus proches du sujet et on les donne à Claude comme
-- exemples de la voix réelle du client (services/memoire_service.py).
-- Embeddings OpenAI text-embedding-3-small (1536 dims), pgvector.
-- =====================================================================

create extension if not exists vector;

create table if not exists contenu_embeddings (
  contenu_id   uuid primary key references contenu(id) on delete cascade,
  telegram_id  uuid not null,
  genre        text not null,              -- 'post' | 'carrousel' | 'script'
  reseau_cible text,
  texte        text not null,              -- texte indexé (borné ~2000 car.)
  embedding    vector(1536) not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_contenu_embeddings_user on contenu_embeddings(telegram_id, genre);
create index if not exists idx_contenu_embeddings_hnsw on contenu_embeddings
  using hnsw (embedding vector_cosine_ops);

-- Les p_limit contenus du compte les plus proches (cosinus), même genre. Le
-- réseau n'est qu'une préférence (bonus de 0.05), pas un filtre : peu de comptes
-- ont assez de contenus validés par réseau pour filtrer strictement.
create or replace function match_contenu_embeddings(
  p_user uuid, p_embedding vector(1536), p_genre text, p_reseau text default null, p_limit int default 4)
returns table (contenu_id uuid, texte text, reseau_cible text, similarite float)
language sql stable as $$
  select e.contenu_id, e.texte, e.reseau_cible,
         (1 - (e.embedding <=> p_embedding))
           + case when p_reseau is not null and e.reseau_cible = p_reseau then 0.05 else 0 end as similarite
  from contenu_embeddings e
  where e.telegram_id = p_user and e.genre = p_genre
  order by e.embedding <=> p_embedding
  limit p_limit;
$$;
