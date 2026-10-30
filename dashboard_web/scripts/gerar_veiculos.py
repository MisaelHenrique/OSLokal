"""Gera exemplo/veiculos.json (cadastro central do sistema de OS) a partir da planilha de frota.

Uso (da pasta dashboard_web):
    python scripts/gerar_veiculos.py "../../Frota Total atualizada - LOKAL Locações (2026-10-30).xlsx"

Depois, para mandar ao Supabase: npm run frota
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl

# Responsável da planilha -> filial do sistema (mesmos nomes das planilhas por filial e da dashboard)
FILIAIS = {
    'LUIS ANDRE': 'LUÍS ANDRÉ',
    'JOSE GERALDO': 'JOSÉ GERALDO',
    'TIAGO SANTIAGO': 'THIAGO SANTIAGO',
    'THIAGO SANTIAGO': 'THIAGO SANTIAGO',
    'ALVARO JUNIOR': 'ÁLVARO JÚNIOR',
    'PAULO PEREIRA': 'OUTROS',
    '-': 'MATRIZ',
}


def sem_acento(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def limpo(v):
    return re.sub(r'\s+', ' ', str(v if v is not None else '')).strip()


def filial_de(resp):
    base = sem_acento(limpo(resp).upper())
    base = re.sub(r'\s*-\s*[A-Z]{2}$', '', base).strip() or '-'
    if base not in FILIAIS:
        raise SystemExit(f'Responsável sem filial definida: {resp!r}. Acrescente em FILIAIS.')
    return FILIAIS[base]


def main(arquivo):
    ws = openpyxl.load_workbook(arquivo, data_only=True).active
    cab = None
    saida = []
    for linha in ws.iter_rows(values_only=True):
        if cab is None:
            if linha and limpo(linha[0]).upper() == 'Nº':
                cab = [sem_acento(limpo(c).upper()) for c in linha]
            continue
        d = dict(zip(cab, linha))
        chassi = limpo(d.get('CHASSI')).upper().replace(' ', '')
        if not chassi:
            continue
        modelo = limpo(d.get('MODELO/MARCA'))
        tipo, _, marca_modelo = modelo.partition('/')
        placa = limpo(d.get('PLACA')).upper().replace(' ', '')
        saida.append({
            'chassi': chassi,
            'frota': limpo(d.get('NO') or d.get('Nº')),
            'placa': '' if placa in ('', '-') else placa,
            'renavam': limpo(d.get('RENAVAM')),
            'tipo': limpo(tipo) if marca_modelo else '',
            'modelo': limpo(marca_modelo or tipo),
            'ano': limpo(d.get('ANO')),
            'empresa': limpo(d.get('EMPRESA')),
            'responsavel': limpo(d.get('RESPONSAVEL')),
            'filial': filial_de(d.get('RESPONSAVEL')),
            'obra': limpo(d.get('OBRAS')),
            'ativo': True,
        })
    vistos = set()
    for v in saida:
        if v['chassi'] in vistos:
            raise SystemExit(f'Chassi repetido: {v["chassi"]}')
        vistos.add(v['chassi'])
    destino = Path(__file__).resolve().parent.parent / 'exemplo' / 'veiculos.json'
    destino.write_text(json.dumps({'origem': Path(arquivo).name, 'veiculos': saida}, ensure_ascii=False, indent=1),
                       encoding='utf-8')
    por_filial = {}
    for v in saida:
        por_filial[v['filial']] = por_filial.get(v['filial'], 0) + 1
    print(f'{len(saida)} veículos gravados em {destino}')
    print(por_filial)
    print('Sem placa:', sum(1 for v in saida if not v['placa']))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(sys.argv[1])
