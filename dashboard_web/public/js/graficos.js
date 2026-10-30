// Gráficos com Chart.js (vendor/chart.umd.min.js, global Chart). Cores vêm dos tokens CSS, então o tema
// claro/escuro troca junto. Regras: um eixo só, barras finas com cantos arredondados, cor segue a entidade.

const ativos = new Set();

const css = (nome) => getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
export const corSerie = (i) => css('--s' + (i + 1));
export const corOutros = () => css('--outros');
export const corUnica = () => css('--serie-unica');

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaCurta = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });

function base(horizontal) {
  const tinta2 = css('--tinta2'), grade = css('--grade'), eixo = css('--eixo');
  const fonte = { family: getComputedStyle(document.body).fontFamily, size: 12 };
  const eixoValor = {
    beginAtZero: true, grid: { color: grade, drawTicks: false }, border: { display: false },
    ticks: { color: eixo, font: fonte, padding: 6, callback: (v) => moedaCurta.format(v), maxTicksLimit: 6 }
  };
  const eixoCat = { grid: { display: false }, border: { color: css('--linha-forte') }, ticks: { color: tinta2, font: fonte, autoSkip: true } };
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
    interaction: { mode: horizontal ? 'nearest' : 'index', intersect: horizontal, axis: horizontal ? 'y' : 'x' },
    indexAxis: horizontal ? 'y' : 'x',
    scales: horizontal ? { x: eixoValor, y: eixoCat } : { x: eixoCat, y: eixoValor },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: css('--cartao'), titleColor: css('--tinta'), bodyColor: css('--tinta2'),
        borderColor: css('--linha-forte'), borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
        titleFont: { ...fonte, weight: '600' }, bodyFont: fonte,
        callbacks: { label: (c) => ' ' + (c.dataset.label ? c.dataset.label + ': ' : '') + moeda.format(c.parsed[horizontal ? 'x' : 'y'] || 0) }
      }
    }
  };
}

function criar(canvas, config) {
  const g = new window.Chart(canvas, config);
  ativos.add(g);
  return g;
}

export function destruirTodos() {
  ativos.forEach((g) => g.destroy());
  ativos.clear();
}

/** Barras de uma série (cor única). Horizontal quando os rótulos são longos ou muitos. */
export function barras(canvas, rotulos, valores, { horizontal = false, aoClicar, rotuloSerie = '' } = {}) {
  const cfg = base(horizontal);
  if (aoClicar) {
    cfg.onClick = (ev, els) => { if (els.length) aoClicar(els[0].index); };
    cfg.onHover = (ev, els) => { ev.native.target.style.cursor = els.length ? 'pointer' : 'default'; };
  }
  return criar(canvas, {
    type: 'bar',
    data: { labels: rotulos, datasets: [{ label: rotuloSerie, data: valores, backgroundColor: corUnica(), borderRadius: 4,
      borderSkipped: 'start', maxBarThickness: horizontal ? 22 : 36, categoryPercentage: 0.8, barPercentage: 0.9 }] },
    options: cfg
  });
}

/** Barras empilhadas por mês. series: [{ chave, rotulo, valores }] na ordem fixa; "Outros" em cinza. */
export function empilhadas(canvas, rotulos, series) {
  const cfg = base(false);
  cfg.scales.x.stacked = true; cfg.scales.y.stacked = true;
  cfg.plugins.tooltip.callbacks.footer = (itens) => 'Total: ' + moeda.format(itens.reduce((s, c) => s + (c.parsed.y || 0), 0));
  cfg.plugins.tooltip.footerColor = css('--tinta');
  return criar(canvas, {
    type: 'bar',
    data: {
      labels: rotulos,
      datasets: series.map((s, i) => ({
        label: s.rotulo, data: s.valores, backgroundColor: s.chave === 'Outros' ? corOutros() : corSerie(i),
        borderColor: css('--cartao'), borderWidth: { top: 2, bottom: 0, left: 0, right: 0 }, borderSkipped: false,
        borderRadius: 0, maxBarThickness: 36
      }))
    },
    options: cfg
  });
}

/** Rosca para dividir um todo em poucas partes (≤ 4), ex.: peças × mão de obra. */
export function rosca(canvas, rotulos, valores) {
  const cfg = base(false);
  delete cfg.scales;
  cfg.cutout = '68%';
  cfg.interaction = { mode: 'nearest', intersect: true };
  cfg.plugins.tooltip.callbacks.label = (c) => ' ' + c.label + ': ' + moeda.format(c.parsed || 0);
  return criar(canvas, {
    type: 'doughnut',
    data: { labels: rotulos, datasets: [{ data: valores, backgroundColor: valores.map((_, i) => corSerie(i)), borderColor: css('--cartao'), borderWidth: 2 }] },
    options: cfg
  });
}
