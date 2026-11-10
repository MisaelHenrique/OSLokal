-- Atualiza um banco Supabase já no esquema simplificado (depois de atualizar_simplificado.sql) para incluir o
-- campo de peças por grupo. Rode uma vez só, no SQL Editor do Supabase, ANTES do deploy do código que usa
-- "pecas" (sem esta coluna, todo lançamento de OS feita vai falhar com erro de coluna desconhecida no PostgREST).

alter table os add column if not exists pecas text[] not null default '{}';

notify pgrst, 'reload schema';
