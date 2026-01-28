// 回测逻辑和UI交互
function $(id){return document.getElementById(id)}

// 直接嵌入真实QQQ年度收益率 (%)
const yearlyReturns = {
  1999:78.94,2000:-38.40,2001:-27.18,2002:-39.24,2003:43.60,2004:10.84,
  2005:2.64,2006:4.82,2007:18.81,2008:-40.79,2009:48.28,2010:18.21,
  2011:1.94,2012:15.90,2013:32.43,2014:20.14,2015:9.76,2016:9.38,
  2017:31.45,2018:-1.85,2019:38.41,2020:46.19,2021:29.24,2022:-33.22,
  2023:55.83,2024:27.74,2025:20.58,2026:2.94
};

let chart = null; // Chart.js instance

function runBacktest(){
  const initial = parseFloat($('initialCapital').value)||0;
  const allocNasdaq = (parseFloat($('allocNasdaq').value)||0)/100;
  const cashYield = (parseFloat($('cashYield').value)||0)/100;
  const rebalance = $('rebalance').checked;
  const startYear = parseInt($('startYear').value);
  const endYear = parseInt($('endYear').value);
  const wdWhen = $('wdWhen').value;
  const wdMode = document.querySelector('input[name="wdMode"]:checked').value;
  const wdFixed = parseFloat($('wdFixed').value)||0;
  const wdPct = (parseFloat($('wdPct').value)||0)/100;

  let nasdaq = initial * allocNasdaq;
  let cash = initial - nasdaq;

  const rows = [];

  for(let y=startYear;y<=endYear;y++){
    let total = nasdaq + cash;

    // withdrawal at start
    if(wdWhen==='start' && wdMode!=='none'){
      let wd = wdMode==='fixed' ? wdFixed : total * wdPct;
      wd = Math.min(wd, total);
      // proportionally take from each bucket
      const nasdaqShare = total>0 ? nasdaq/total : 0;
      nasdaq -= wd * nasdaqShare;
      cash -= wd * (1-nasdaqShare);
    }

    // apply returns
    const r = (yearlyReturns[y]!==undefined) ? yearlyReturns[y]/100 : 0;
    nasdaq *= (1 + r);
    cash *= (1 + cashYield);

    // withdrawal at end
    if(wdWhen==='end' && wdMode!=='none'){
      total = nasdaq + cash;
      let wd = wdMode==='fixed' ? wdFixed : total * wdPct;
      wd = Math.min(wd, total);
      const nasdaqShare = total>0 ? nasdaq/total : 0;
      nasdaq -= wd * nasdaqShare;
      cash -= wd * (1-nasdaqShare);
    }

    // rebalance
    if(rebalance){
      const tot = Math.max(0, nasdaq + cash);
      nasdaq = tot * allocNasdaq;
      cash = tot - nasdaq;
    }

    total = nasdaq + cash;
    rows.push({year: y, total, nasdaq, cash});

    if(total <= 0) break;
  }

  renderResults(rows);
}

function renderResults(rows){
  const tbody = $('results').querySelector('tbody');
  tbody.innerHTML = '';
  const labels = [];
  const totals = [];
  const nasdaqVals = [];
  const cashVals = [];
  
  for(const r of rows){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.year}</td><td>$${r.total.toFixed(2)}</td><td>$${r.nasdaq.toFixed(2)}</td><td>$${r.cash.toFixed(2)}</td>`;
    tbody.appendChild(tr);
    labels.push(r.year.toString());
    totals.push(Math.round(r.total * 100) / 100);
    nasdaqVals.push(Math.round(r.nasdaq * 100) / 100);
    cashVals.push(Math.round(r.cash * 100) / 100);
  }
  
  drawChartJS(labels, totals, nasdaqVals, cashVals);
}

function drawChartJS(labels, totals, nasdaqVals, cashVals){
  const ctx = $('chart').getContext('2d');
  
  // 销毁旧图表
  if(chart) chart.destroy();
  
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '总资产 (USD)',
          data: totals,
          borderColor: '#1f77b4',
          backgroundColor: 'rgba(31, 119, 180, 0.05)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#1f77b4'
        },
        {
          label: '纳斯达克 (USD)',
          data: nasdaqVals,
          borderColor: '#ff7f0e',
          backgroundColor: 'rgba(255, 127, 14, 0.05)',
          borderWidth: 1.5,
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: '#ff7f0e'
        },
        {
          label: '货币基金 (USD)',
          data: cashVals,
          borderColor: '#2ca02c',
          backgroundColor: 'rgba(44, 160, 44, 0.05)',
          borderWidth: 1.5,
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 5,
          pointBackgroundColor: '#2ca02c'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { usePointStyle: true, padding: 15, font: {size: 12} }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: 'rgba(0,0,0,0.8)',
          titleFont: {size: 13},
          bodyFont: {size: 12},
          padding: 10,
          displayColors: true,
          callbacks: {
            label: function(ctx){
              return ctx.dataset.label + ': $' + ctx.parsed.y.toFixed(2);
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          title: { display: true, text: '年份 (Year)' },
          grid: { drawBorder: true, color: 'rgba(0,0,0,0.05)' }
        },
        y: {
          display: true,
          title: { display: true, text: '资产价值 (USD)' },
          grid: { color: 'rgba(0,0,0,0.1)' },
          ticks: {
            callback: function(val){
              return '$' + val.toLocaleString();
            }
          }
        }
      },
      interaction: {
        mode: 'nearest',
        intersect: false
      }
    }
  });
}

function downloadCSV(){
  const rows = [];
  const trs = $('results').querySelectorAll('tbody tr');
  for(const tr of trs){
    const cols = Array.from(tr.children).map(td=>td.textContent);
    rows.push(cols.join(','));
  }
  const csv = 'Year,Total,Nasdaq,Cash\n' + rows.join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'backtest_results.csv';
  a.click();
  URL.revokeObjectURL(url);
}

window.addEventListener('DOMContentLoaded', ()=>{
  $('run').addEventListener('click', runBacktest);
  $('download').addEventListener('click', downloadCSV);
});
