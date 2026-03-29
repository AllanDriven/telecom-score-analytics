// ==========================================================
// 1. VARIÁVEIS GLOBAIS E CONFIGURAÇÕES VISUAIS
// ==========================================================
let dadosGlobais = [];
let dadosAtuaisFiltrados = []; 
let charts = {}; 

// URL DA API (Mude aqui quando publicar no servidor oficial)
const API_BASE_URL = 'http://127.0.0.1:5001';

// Paleta Oficial Concentrix
const coresScores = {
    'Score 0': '#CC3262',   // Raspberry Pink (Crítico)
    'Score 1': '#FBCA18',   // Tangerine Orange (Alerta)
    'Score 1.5': '#c37521', // Sunshine Yellow (Atenção)
    'Score 2': '#5cd2b9',   // Seafoam Teal (Transição)
    'Score 3': '#007380',   // Jade Green (Bom)
    'Score 4': '#003D5B',   // Unifying Blue (Ótimo)
    'Score 5': '#11533f'    // Charcoal Gray (Neutro/Excelente)
};

// Configuração Padrão do Chart.js
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.color = '#64748b';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.9)';
Chart.defaults.plugins.tooltip.padding = 12;

// ==========================================================
// 2. INICIALIZAÇÃO E CARREGAMENTO DA API
// ==========================================================
window.onload = carregarDados;

// Inicializa o Tooltip (Botão ?) do Bootstrap
document.addEventListener("DOMContentLoaded", function() {
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});

async function carregarDados() {
    try {
        const resposta = await fetch(`${API_BASE_URL}/api/dados-score`);
        dadosGlobais = await resposta.json();
        
        // Preenche o nível 1 (Executivo) e a Data (que é independente)
        atualizarSelect('filtroExecutivo', obterUnicos(dadosGlobais, 'EXECUTIVO'), false);
        atualizarSelect('filtroData', obterUnicos(dadosGlobais, 'DATE').reverse(), false);
        
        // Dispara a cascata do nível 1 para baixo
        aoMudarFiltro(1); 
        
        // Carrega os filtros da aba de Extração (Aba 2)
        carregarFiltrosExtracao();
        
    } catch (erro) {
        console.error("Erro ao carregar os dados:", erro);
        alert("Erro ao conectar na API. Acionar o time de dados do telecom");
    }
}

// ==========================================================
// 3. LÓGICA DE FILTROS E CASCATA
// ==========================================================
function obterUnicos(dados, chave) {
    return [...new Set(dados.map(d => String(d[chave])))].filter(v => v !== 'undefined' && v !== 'null').sort();
}

function getValoresSelecionados(id) {
    const select = document.getElementById(id);
    if (!select.multiple) return [select.value].filter(Boolean);
    return Array.from(select.selectedOptions).map(opt => opt.value);
}

function atualizarSelect(id, valoresDisponiveis, isMultiple) {
    const select = document.getElementById(id);
    const selecoesAtuais = getValoresSelecionados(id);
    
    select.innerHTML = '';
    if (!isMultiple) select.add(new Option('Todos', ''));
    
    valoresDisponiveis.forEach(val => {
        const opt = new Option(val, val);
        if (selecoesAtuais.includes(String(val))) opt.selected = true;
        select.add(opt);
    });
}

function aoMudarFiltro(nivelModificado) {
    const exec = document.getElementById('filtroExecutivo').value;
    const cart = document.getElementById('filtroCarteira').value;
    const servs = getValoresSelecionados('filtroServidor');

    // Nível 2: Carteira
    if (nivelModificado <= 1) {
        let base = exec ? dadosGlobais.filter(d => d.EXECUTIVO === exec) : dadosGlobais;
        atualizarSelect('filtroCarteira', obterUnicos(base, 'CARTEIRA'), false);
    }
    
    // Nível 3: Servidor
    if (nivelModificado <= 2) {
        const cartAtual = document.getElementById('filtroCarteira').value; 
        let base = dadosGlobais.filter(d => (!exec || d.EXECUTIVO === exec) && (!cartAtual || d.CARTEIRA === cartAtual));
        atualizarSelect('filtroServidor', obterUnicos(base, 'SERVIDOR'), true);
    }

    // Nível 4: Fila
    if (nivelModificado <= 3) {
        const cartAtual = document.getElementById('filtroCarteira').value;
        const servAtuais = getValoresSelecionados('filtroServidor');
        let base = dadosGlobais.filter(d => 
            (!exec || d.EXECUTIVO === exec) && (!cartAtual || d.CARTEIRA === cartAtual) &&
            (servAtuais.length === 0 || servAtuais.includes(d.SERVIDOR))
        );
        atualizarSelect('filtroFila', obterUnicos(base, 'FILA'), true);
    }

    // Nível 5: Mailing
    if (nivelModificado <= 4) {
        const cartAtual = document.getElementById('filtroCarteira').value;
        const servAtuais = getValoresSelecionados('filtroServidor');
        const filAtuais = getValoresSelecionados('filtroFila');
        let base = dadosGlobais.filter(d => 
            (!exec || d.EXECUTIVO === exec) && (!cartAtual || d.CARTEIRA === cartAtual) &&
            (servAtuais.length === 0 || servAtuais.includes(d.SERVIDOR)) &&
            (filAtuais.length === 0 || filAtuais.includes(String(d.FILA)))
        );
        atualizarSelect('filtroMailing', obterUnicos(base, 'MAILLING'), true);
    }

    aplicarFiltros();
}

// ==========================================================
// 4. MATEMÁTICA E PROCESSAMENTO DOS GRÁFICOS (DINÂMICOS V2)
// ==========================================================

// Gera cor aleatória para scores novos que surgirem sem paleta definida
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) { color += letters[Math.floor(Math.random() * 16)]; }
    return color;
}

// Normaliza nome do score: '3' ou 3.0 => 'Score 3'
function nomeScore(d) {
    const v = d.SCORE_NOME !== null && d.SCORE_NOME !== undefined ? d.SCORE_NOME : '5.0';
    return `Score ${parseFloat(v)}`;
}

// Soma Volumes (dinâmico: agrupa por nome do score)
function somarScores(dados) {
    let s = { total: 0, scores: {} };
    dados.forEach(d => {
        const k = nomeScore(d);
        const v = parseInt(d.VOLUME_DISCAGENS) || 0;
        s.total += v;
        s.scores[k] = (s.scores[k] || 0) + v;
    });
    return s;
}

// Soma Custos (dinâmico: agrupa por nome do score)
function somarCustos(dados) {
    let s = { total: 0, scores: {} };
    dados.forEach(d => {
        const k = nomeScore(d);
        const c = parseFloat(d.CUSTO_TOTAL) || 0;
        s.total += c;
        s.scores[k] = (s.scores[k] || 0) + c;
    });
    return s;
}

// Helpers
function calcPct(valor, total) { return total > 0 ? ((valor / total) * 100).toFixed(1) : 0; }
function formatarMoeda(valor) { return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

// KPIs: agrupa por faixas numéricas de score
function atualizarKPIs(dados) {
    let v = { critica: 0, ruim: 0, media: 0, boa: 0, total: 0 };
    let c = { critica: 0, ruim: 0, media: 0, boa: 0 };

    dados.forEach(d => {
        const scoreVal = parseFloat(d.SCORE_NOME);
        const vol = parseInt(d.VOLUME_DISCAGENS) || 0;
        const custo = parseFloat(d.CUSTO_TOTAL) || 0;
        v.total += vol;

        if (scoreVal <= 1)                      { v.critica += vol; c.critica += custo; }
        else if (scoreVal > 1 && scoreVal < 2)  { v.ruim    += vol; c.ruim    += custo; }
        else if (scoreVal >= 2 && scoreVal < 4) { v.media   += vol; c.media   += custo; }
        else if (scoreVal >= 4)                 { v.boa     += vol; c.boa     += custo; }
    });

    document.getElementById('kpiCritica').innerText = calcPct(v.critica, v.total) + '%';
    document.getElementById('kpiRuim').innerText    = calcPct(v.ruim,    v.total) + '%';
    document.getElementById('kpiMedia').innerText   = calcPct(v.media,   v.total) + '%';
    document.getElementById('kpiBoa').innerText     = calcPct(v.boa,     v.total) + '%';

    document.getElementById('kpiCriticaCusto').innerText = formatarMoeda(c.critica);
    document.getElementById('kpiRuimCusto').innerText    = formatarMoeda(c.ruim);
    document.getElementById('kpiMediaCusto').innerText   = formatarMoeda(c.media);
    document.getElementById('kpiBoaCusto').innerText     = formatarMoeda(c.boa);
}

// ==========================================================
// 5. MOTORES DE DESENHO DOS GRÁFICOS (CHART.JS) - DINÂMICOS
// ==========================================================

function desenharGraficoPizza(dados, canvasId, isCusto = false) {
    const s = isCusto ? somarCustos(dados) : somarScores(dados);
    // Ordena os scores (Score 0, Score 1, Score 1.5...)
    const labels = Object.keys(s.scores).sort((a, b) => parseFloat(a.split(' ')[1]) - parseFloat(b.split(' ')[1]));
    const valores = labels.map(l => isCusto ? s.scores[l] : parseFloat(calcPct(s.scores[l], s.total)));
    const cores   = labels.map(l => coresScores[l] || getRandomColor());

    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: valores, backgroundColor: cores, borderWidth: 0 }] },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '65%',
            plugins: {
                legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } },
                tooltip: { callbacks: { label: ctx => isCusto ? ` ${ctx.label}: ${formatarMoeda(ctx.raw)}` : ` ${ctx.label}: ${ctx.raw}%` } }
            }
        }
    });
}

function desenharGraficoBarras(dados, chaveGrp, canvasId, containerId, isCusto = false) {
    // Agrupa por categoria (FILA ou MAILING) e coleta todos os scores presentes
    const agrupado = {};
    const todosScores = new Set();
    dados.forEach(d => {
        const k = d[chaveGrp] || 'N/A';
        if (!agrupado[k]) agrupado[k] = [];
        agrupado[k].push(d);
        todosScores.add(nomeScore(d));
    });

    const labels = Object.keys(agrupado).sort();
    const scoresOrdenados = Array.from(todosScores).sort((a, b) => parseFloat(a.split(' ')[1]) - parseFloat(b.split(' ')[1]));

    const datasets = scoresOrdenados.map(sc => ({
        label: sc,
        backgroundColor: coresScores[sc] || getRandomColor(),
        borderRadius: 4,
        data: labels.map(l => {
            const grupo = agrupado[l];
            const sub   = grupo.filter(x => nomeScore(x) === sc);
            const totalGeral = isCusto ? somarCustos(grupo).total : somarScores(grupo).total;
            const somaSub    = isCusto ? somarCustos(sub).total   : somarScores(sub).total;
            return isCusto ? somaSub : parseFloat(calcPct(somaSub, totalGeral));
        })
    }));

    const container = document.getElementById(containerId);
    container.style.minWidth = (labels.length * 50) + 'px';
    container.style.width = '100%';

    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'bar', data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, border: { display: false }, ticks: { callback: v => isCusto ? formatarMoeda(v) : v + '%' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => isCusto ? ` ${ctx.dataset.label}: ${formatarMoeda(ctx.raw)}` : ` ${ctx.dataset.label}: ${ctx.raw}%` } }
            }
        }
    });
}

function desenharGraficoLinha(dados, canvasId, isCusto = false) {
    const agrupado = {};
    const todosScores = new Set();
    dados.forEach(d => {
        const k = d.DATE;
        if (!agrupado[k]) agrupado[k] = [];
        agrupado[k].push(d);
        todosScores.add(nomeScore(d));
    });

    let labels = Object.keys(agrupado).sort();
    if (labels.length > 30) labels = labels.slice(-30); // Garante a visão máxima de 30 dias
    const scoresOrdenados = Array.from(todosScores).sort((a, b) => parseFloat(a.split(' ')[1]) - parseFloat(b.split(' ')[1]));

    const datasets = scoresOrdenados.map(sc => {
        const cor = coresScores[sc] || getRandomColor();
        return {
            label: sc,
            borderColor: cor, backgroundColor: cor,
            tension: 0.4, pointRadius: 2, borderWidth: 2,
            data: labels.map(l => {
                const grupo = agrupado[l];
                const sub   = grupo.filter(x => nomeScore(x) === sc);
                const totalGeral = isCusto ? somarCustos(grupo).total : somarScores(grupo).total;
                const somaSub    = isCusto ? somarCustos(sub).total   : somarScores(sub).total;
                return isCusto ? somaSub : parseFloat(calcPct(somaSub, totalGeral));
            })
        };
    });

    if (charts[canvasId]) charts[canvasId].destroy();
    charts[canvasId] = new Chart(document.getElementById(canvasId).getContext('2d'), {
        type: 'line', data: { labels, datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } },
                y: { border: { display: false }, ticks: { callback: v => isCusto ? formatarMoeda(v) : v + '%' } }
            },
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
                tooltip: { callbacks: { label: ctx => isCusto ? ` ${ctx.dataset.label}: ${formatarMoeda(ctx.raw)}` : ` ${ctx.dataset.label}: ${ctx.raw}%` } }
            },
            interaction: { mode: 'index', intersect: false }
        }
    });
}

// ==========================================================
// 6. GATILHO PRINCIPAL (ATUALIZA TUDO NA TELA)
// ==========================================================
function aplicarFiltros() {
    const f = {
        executivo: document.getElementById('filtroExecutivo').value,
        carteira: document.getElementById('filtroCarteira').value,
        servidores: getValoresSelecionados('filtroServidor'),
        filas: getValoresSelecionados('filtroFila'),
        mailings: getValoresSelecionados('filtroMailing'),
        data: document.getElementById('filtroData').value
    };

    let df = dadosGlobais.filter(d => 
        (!f.executivo || d.EXECUTIVO === f.executivo) &&
        (!f.carteira || d.CARTEIRA === f.carteira) &&
        (f.servidores.length === 0 || f.servidores.includes(d.SERVIDOR)) &&
        (f.filas.length === 0 || f.filas.includes(String(d.FILA))) &&
        (f.mailings.length === 0 || f.mailings.includes(String(d.MAILLING))) &&
        (!f.data || d.DATE === f.data)
    );
    
    dadosAtuaisFiltrados = df;

    let dfSemData = dadosGlobais.filter(d => 
        (!f.executivo || d.EXECUTIVO === f.executivo) &&
        (!f.carteira || d.CARTEIRA === f.carteira) &&
        (f.servidores.length === 0 || f.servidores.includes(d.SERVIDOR)) &&
        (f.filas.length === 0 || f.filas.includes(String(d.FILA))) &&
        (f.mailings.length === 0 || f.mailings.includes(String(d.MAILLING)))
    );

    atualizarKPIs(df);

    // Renderiza Dashboard de Volume (Aba 1)
    desenharGraficoPizza(df, 'graficoPizza', false);
    desenharGraficoBarras(df, 'FILA', 'graficoFila', 'containerFila', false);
    desenharGraficoBarras(df, 'MAILLING', 'graficoMailing', 'containerMailing', false);
    desenharGraficoLinha(dfSemData, 'graficoLinha', false);

    // Renderiza Dashboard de Custo (Aba Nova)
    desenharGraficoPizza(df, 'graficoPizzaCusto', true);
    desenharGraficoBarras(df, 'FILA', 'graficoFilaCusto', 'containerFilaCusto', true);
    desenharGraficoBarras(df, 'MAILLING', 'graficoMailingCusto', 'containerMailingCusto', true);
    desenharGraficoLinha(dfSemData, 'graficoLinhaCusto', true);
}


// ==========================================================
// 7. LÓGICA DE EXTRAÇÃO E EXPORTAÇÃO (ABA 3)
// ==========================================================

function baixarCSV(dados, nomeArquivo) {
    if (!dados || dados.length === 0) {
        alert("Nenhum dado encontrado para exportar.");
        return;
    }
    
    const cabecalho = Object.keys(dados[0]).join(';');
    const linhas = dados.map(d => 
        Object.values(d).map(v => v === null || v === undefined ? '' : `"${String(v).replace(/"/g, '""')}"`).join(';')
    );
    
    const csv = cabecalho + '\n' + linhas.join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' }); 
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = nomeArquivo + ".csv";
    link.click();
}

function exportarResumo() {
    if (dadosAtuaisFiltrados.length === 0) {
        alert("A base está vazia. Verifique os filtros na Aba Dashboard.");
        return;
    }
    baixarCSV(dadosAtuaisFiltrados, "Resumo_Score_Carteiras");
}

async function exportarNumeros() {
    const data = document.getElementById('extData').value;
    const exec = document.getElementById('extExec').value;
    const cart = document.getElementById('extCart').value;
    const fila = document.getElementById('extFila').value;
    const mailing = document.getElementById('extMailing').value;
    const score = document.getElementById('extScore').value;

    if (!data || !exec || !cart) {
        alert("Por favor, preencha os filtros obrigatórios: Data, Executivo e Carteira.");
        return;
    }

    document.getElementById('btnGerarExt').disabled = true;
    document.getElementById('loadingExt').style.display = 'inline';

    try {
        let url = `${API_BASE_URL}/api/extracao-numeros?data=${data}&executivo=${exec}&carteira=${cart}`;
        if (fila) url += `&fila=${fila}`;
        if (mailing) url += `&mailing=${mailing}`;
        if (score) url += `&score=${score}`;

        const resposta = await fetch(url);
        const dadosNumeros = await resposta.json();

        if (dadosNumeros.erro) {
            alert("Erro retornado pelo banco: " + dadosNumeros.erro);
        } else {
            baixarCSV(dadosNumeros, `Numeros_Discados_${data}_${cart}`);
        }
    } catch (erro) {
        alert("Erro na conexão com a API.");
        console.error(erro);
    } finally {
        document.getElementById('btnGerarExt').disabled = false;
        document.getElementById('loadingExt').style.display = 'none';
    }
}

function carregarFiltrosExtracao() {
    atualizarSelect('extData', obterUnicos(dadosGlobais, 'DATE').reverse(), false);
    if(document.getElementById('extData').options.length > 0) document.getElementById('extData').options[0].remove();

    atualizarSelect('extExec', obterUnicos(dadosGlobais, 'EXECUTIVO'), false);
    document.getElementById('extExec').options[0].text = "Selecione...";
    document.getElementById('extExec').options[0].value = "";

    // Popula o filtro de Score dinamicamente a partir dos dados reais da V2
    const selectScore = document.getElementById('extScore');
    const scoresUnicos = obterUnicos(dadosGlobais, 'SCORE_NOME')
        .filter(v => v !== 'null' && v !== 'undefined')
        .sort((a, b) => parseFloat(a) - parseFloat(b)); // Ordena numericamente: 0, 1, 1.5, 2...
    
    selectScore.innerHTML = '<option value="">Todos</option>'; // Reset
    scoresUnicos.forEach(sc => {
        const opt = document.createElement('option');
        opt.value = sc;  // valor numerico ex: "1.5"
        opt.text  = `Score ${parseFloat(sc)}`; // label legível ex: "Score 1.5"
        selectScore.appendChild(opt);
    });
}

function atualizarCarteirasExtracao() {
    const exec = document.getElementById('extExec').value;
    let base = exec ? dadosGlobais.filter(d => d.EXECUTIVO === exec) : [];
    atualizarSelect('extCart', obterUnicos(base, 'CARTEIRA'), false);
    document.getElementById('extCart').options[0].text = "Selecione...";
    document.getElementById('extCart').options[0].value = "";
    atualizarOpcionaisExtracao(); 
}

function atualizarOpcionaisExtracao() {
    const exec = document.getElementById('extExec').value;
    const cart = document.getElementById('extCart').value;
    let base = dadosGlobais.filter(d => d.EXECUTIVO === exec && d.CARTEIRA === cart);
    
    atualizarSelect('extFila', obterUnicos(base, 'FILA'), false);
    atualizarSelect('extMailing', obterUnicos(base, 'MAILLING'), false);
}

// Gera e baixa um modelo de TXT para o usuário entender como deve subir
function baixarModeloTXT() {
    const conteudo = "41996713055\n41991569234\n11987654321";
    const blob = new Blob([conteudo], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "modelo_consulta_score.txt";
    link.click();
}

// Lógica de Leitura do TXT e Chamada POST para a API
async function consultarScoreNumeros() {
    const inputNum = document.getElementById('inputNumeroScore').value.trim();
    const inputFile = document.getElementById('inputFileScore').files[0];
    
    let numeros = [];

    // 1. Se preencheu o campo único, adiciona na lista
    if (inputNum) {
        numeros.push(inputNum);
    }

    // 2. Se subiu o TXT, lê o conteúdo
    if (inputFile) {
        const texto = await inputFile.text();
        // Quebra as linhas, tira espaços laterais e remove linhas vazias
        const numsArquivo = texto.split('\n')
                                 .map(n => n.trim())
                                 .filter(n => n.length > 0);
        
        numeros = numeros.concat(numsArquivo);
    }

    if (numeros.length === 0) {
        alert("Por favor, digite um número único ou faça o upload de um arquivo .txt.");
        return;
    }

    // 3. Remove telefones duplicados para não pesquisar a mesma coisa duas vezes
    numeros = [...new Set(numeros)];

    // Gatilho visual de carregamento
    document.getElementById('btnConsultarScore').disabled = true;
    document.getElementById('loadingScore').style.display = 'inline';

    try {
        const resposta = await fetch(`${API_BASE_URL}/api/consultar-score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numeros: numeros })
        });
        
        const dadosResultados = await resposta.json();

        if (dadosResultados.erro) {
            alert("Erro retornado pelo banco: " + dadosResultados.erro);
        } else if (dadosResultados.length === 0) {
            alert("Nenhum dos números consultados foi encontrado na tabela de Score.");
        } else {
            baixarCSV(dadosResultados, `Resultado_Consulta_Score_${numeros.length}_numeros`);
        }
    } catch (erro) {
        alert("Erro na conexão com a API.");
        console.error(erro);
    } finally {
        // Restaura botão
        document.getElementById('btnConsultarScore').disabled = false;
        document.getElementById('loadingScore').style.display = 'none';
    }
}