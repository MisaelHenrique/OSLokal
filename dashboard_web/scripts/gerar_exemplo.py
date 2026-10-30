"""Gera exemplo/dados_exemplo.json (modo demonstração) e exemplo/usuarios_exemplo.json (só para testar no computador).

Fonte: data/exemplo/fato_manutencao_exemplo.csv (OS fictícias, origem_dado = EXEMPLO) cruzado com o cadastro real
(data/processado/dim_veiculo.csv) para filial, tipo e modelo. Tudo sai marcado origem = EXEMPLO.

Uso (na pasta dashboard_web):  python scripts/gerar_exemplo.py
"""
import base64
import csv
import hashlib
import json
import os
from collections import OrderedDict
from pathlib import Path

AQUI = Path(__file__).resolve().parent.parent
PROJETO = AQUI.parent
SAIDA = AQUI / "exemplo"

# responsável no cadastro → nome da filial nas planilhas (igual ao Dados.gs)
FILIAL = {
    "LUÍS ANDRÉ": ("LUÍS ANDRÉ", "LA"),
    "JOSÉ GERALDO": ("JOSÉ GERALDO", "JG"),
    "THIAGO SANTIAGO": ("THIAGO SANTIAGO", "TS"),
    "PÁTIO MATRIZ": ("MATRIZ", "MZ"),
    "ÁLVARO JÚNIOR (CABEÇÃO)": ("ÁLVARO JÚNIOR", "AJ"),
}
OUTROS = ("OUTROS", "OU")

# senhas de teste, só valem no modo local (sem APPS_SCRIPT_URL); em produção estes usuários não existem
USUARIOS = [
    ("admin@exemplo.lokal", "Administrador (teste)", "ADMIN", ""),
    ("diretoria@exemplo.lokal", "Diretoria (teste)", "DIRETORIA", ""),
    ("matriz@exemplo.lokal", "Pátio Matriz (teste)", "FILIAL", "MATRIZ;OUTROS"),
    ("luis@exemplo.lokal", "Luís André (teste)", "FILIAL", "LUÍS ANDRÉ"),
]
SENHA_TESTE = "lokal1234"


def ler(caminho):
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f, delimiter=";"))


def num(s):
    try:
        return round(float(str(s).replace(",", ".")), 2)
    except ValueError:
        return 0.0


def hash_scrypt(senha):
    """Mesmo formato de api/_lib/senha.js."""
    sal = os.urandom(16)
    h = hashlib.scrypt(senha.encode(), salt=sal, n=16384, r=8, p=1, dklen=32)
    b64 = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
    return "$".join(["scrypt", "16384", "8", "1", b64(sal), b64(h)])


def main():
    veic = {v["placa"]: v for v in ler(PROJETO / "data/processado/dim_veiculo.csv") if v["placa"]}
    linhas = ler(PROJETO / "data/exemplo/fato_manutencao_exemplo.csv")

    notas, itens = OrderedDict(), []
    for l in linhas:
        v = veic.get(l["placa"], {})
        filial = FILIAL.get(v.get("responsavel", ""), OUTROS)[0]
        chave = l["id_os"]  # uma nota por OS, para a nota ter vários itens como na vida real
        if chave not in notas:
            notas[chave] = {
                "filial": filial, "id_nota": l["id_os"], "nf": l["nota_fiscal"],
                "emissao": (l["data_conclusao"] or l["data_abertura"])[:10], "fornecedor": l["oficina_fornecedor"],
                "cnpj_fornecedor": "", "valor_nf": 0.0, "interna_ou_terceiro": l["interna_ou_terceiro"],
                "placa": l["placa"], "contrato": "", "lancado_em": "",
            }
        n = notas[chave]
        pecas, mo = num(l["custo_pecas"]), num(l["custo_mao_de_obra"])
        n["valor_nf"] = round(n["valor_nf"] + pecas + mo, 2)
        itens.append({
            "filial": filial, "id_nota": n["id_nota"], "id_item": l["id_item"], "placa": l["placa"],
            "cod_grupo": l["cod_grupo"], "cod_subgrupo": l["cod_subgrupo"], "peca": l["peca"],
            "descricao_servico": l["descricao_servico"], "qtd": num(l["qtd"]), "custo_pecas": pecas,
            "custo_mao_de_obra": mo, "custo_total": round(pecas + mo, 2), "evento_pneu": l["evento_pneu"],
            "posicao_pneu": l["posicao_pneu"], "num_fogo": l["num_fogo"], "marca_pneu": l["marca_pneu"],
            "medida_pneu": l["medida_pneu"], "motivo_retirada": l["motivo_retirada"],
        })

    veiculos = []
    for p, v in veic.items():
        veiculos.append({
            "filial": FILIAL.get(v["responsavel"], OUTROS)[0], "placa": p, "marca_modelo": v["marca_modelo"],
            "tipo_implemento": v["tipo_implemento"], "ano_fabricacao": v["ano_fabricacao"],
            "ano_modelo": v["ano_modelo"], "situacao": "ATIVO",
        })
    filiais = [{"filial": f, "sigla": s} for f, s in list(FILIAL.values()) + [OUTROS]]

    SAIDA.mkdir(exist_ok=True)
    dados = {"origem": "EXEMPLO", "ultima_juncao": "", "notas": list(notas.values()), "itens": itens,
             "veiculos": veiculos, "erros": [], "filiais": filiais}
    (SAIDA / "dados_exemplo.json").write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
    usuarios = [{"email": e, "nome": n, "perfil": p, "filial": f, "senha_hash": hash_scrypt(SENHA_TESTE), "ativo": True}
                for e, n, p, f in USUARIOS]
    (SAIDA / "usuarios_exemplo.json").write_text(
        json.dumps({"aviso": f"Só para o modo local. Senha de todos: {SENHA_TESTE}", "usuarios": usuarios},
                   ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(notas)} notas, {len(itens)} itens, {len(veiculos)} veículos → {SAIDA}")


if __name__ == "__main__":
    main()
