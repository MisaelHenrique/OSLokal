-- Atualiza um banco Supabase já existente pra suportar várias notas fiscais por OS (antes só tinha uma: nf_numero
-- + fornecedor + nf_arquivo). Rode uma vez só, no SQL Editor do Supabase, ANTES do deploy do código que usa
-- "notas" (sem esta coluna, lançar valores em qualquer OS vai falhar com erro de coluna desconhecida).

alter table os add column if not exists notas jsonb not null default '[]'::jsonb;

-- Migra a nota única que já existia pra dentro da lista nova, pra não sumir do histórico.
-- "valor" fica null: a planilha antiga nunca guardou o valor da nota em si (só valor_pecas, que é outra coisa
-- e muitas vezes nem corresponde ao valor da nota) — não dá pra inventar esse número.
update os set notas = jsonb_build_array(jsonb_build_object(
  'numero', nf_numero, 'fornecedor', fornecedor, 'valor', null, 'arquivo', nf_arquivo
))
where notas = '[]'::jsonb and (nf_numero <> '' or fornecedor <> '' or nf_arquivo is not null);

notify pgrst, 'reload schema';
