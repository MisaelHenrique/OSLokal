-- Atualiza um banco Supabase já existente (criado com o esquema.sql antigo, de aprovação/direcionamento) para o
-- esquema novo do PLANO_OS_SIMPLIFICADA.md. Rode uma vez só, no SQL Editor do Supabase, ANTES de
-- "npm run limpar-exemplo" (o limpar-exemplo novo já lê a coluna os_atendida, que só existe depois deste script).
-- As OS antigas (com status como DIRECIONADA, EXECUTADA...) não fazem sentido no fluxo novo; o limpar-exemplo
-- que vem depois apaga as de exemplo, e o exemplo-os semeia os dados novos.
-- NÃO RODAR sem conferir antes com o Misael qual banco é este (o de demonstração do cliente ou outro).

alter table os drop constraint if exists os_tipo_check;
alter table os alter column tipo drop not null;

alter table os add column if not exists cidade text not null default '';
alter table os add column if not exists tipo_local text;
alter table os add column if not exists data_servico date;
alter table os add column if not exists execucao text;
alter table os add column if not exists oficina_externa text not null default '';
alter table os add column if not exists auxiliares text[] not null default '{}';
alter table os add column if not exists foto_frente text;
alter table os add column if not exists foto_painel text;
alter table os add column if not exists fotos_defeito text[] not null default '{}';
alter table os add column if not exists os_atendida bigint references os (id);

alter table os drop constraint if exists os_tipo_local_check;
alter table os add constraint os_tipo_local_check check (tipo_local in ('OBRA', 'GALPAO'));
alter table os drop constraint if exists os_execucao_check;
alter table os add constraint os_execucao_check check (execucao in ('INTERNA', 'EXTERNA'));

create unique index if not exists os_envio_id on os (envio_id) where envio_id is not null;

notify pgrst, 'reload schema';
