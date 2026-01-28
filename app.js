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
  const wdMode = document.querySelector('input[name="wdMode"]:checked').value;
  const wdFixed = parseFloat($('wdFixed').value)||0;
  const wdPct = (parseFloat($('wdPct').value)||0)/100;

  let nasdaq = initial * allocNasdaq;
  let cash = initial - nasdaq;

  const rows = [];

  for(let y=startYear;y<=endYear;y++){
    let yearStart = nasdaq + cash;
    
    // Apply returns
    const r = (yearlyReturns[y]!==undefined) ? yearlyReturns[y]/100 : 0;
    nasdaq *= (1 + r);
    cash *= (1 + cashYield);
    let afterReturn = nasdaq + cash;

    // Withdrawal (at rebalance time)
    let withdrawal = 0;
    if(wdMode!=='none'){
      withdrawal = wdMode==='fixed' ? wdFixed : afterReturn * wdPct;
      withdrawal = Math.min(withdrawal, afterReturn);
      // Proportionally withdraw from each bucket
      const nasdaqShare = afterReturn>0 ? nasdaq/afterReturn : 0;
      nasdaq -= withdrawal * nasdaqShare;
      cash -= withdrawal * (1-nasdaqShare);
    }
    let afterWithdraw = nasdaq + cash;

    // Rebalance
    if(rebalance && afterWithdraw > 0){
      nasdaq = afterWithdraw * allocNasdaq;
      cash = afterWithdraw - nasdaq;
    }

    rows.push({
      nasdaqReturnPct: (r*100),
      year: y,
      yearStart: yearStart,
      afterReturn: afterReturn,
      withdrawal: withdrawal,
      afterWithdraw: afterWithdraw,
      nasdaq: nasdaq,
      cash: cash,
      total: nasdaq + cash
    });

    if(afterWithdraw <= 0) break;
  }

  renderResults(rows, initial);
}

function computeIRR(cashflows){
  // cashflows: array of numbers where index = year (0 = t0)
  function npv(rate){
    let s = 0;
    for(let i=0;i<cashflows.length;i++) s += cashflows[i] / Math.pow(1 + rate, i);
    return s;
  }
  // find sign change
  let low = -0.9999, high = 10;
  let fLow = npv(low), fHigh = npv(high);
  let attempts = 0;
  while(fLow * fHigh > 0 && attempts < 60){
    high *= 2;
    fHigh = npv(high);
    attempts++;
    if(high > 1e6) return NaN;
  }
  if(fLow * fHigh > 0) return NaN;
  // bisection
  for(let i=0;i<100;i++){
    const mid = (low + high) / 2;
    const fMid = npv(mid);
    if(fMid === 0) return mid;
    if(fLow * fMid < 0){
      high = mid; fHigh = fMid;
    } else { low = mid; fLow = fMid; }
  }
  return (low + high) / 2;
}

function calculateMetrics(rows, initialCapital){
  if(rows.length === 0) return {annualReturn: 0, maxDrawdown: 0, totalWithdrawn:0, irr:NaN};
  
  const finalValue = rows[rows.length - 1].total;
  const years = rows.length;
  const totalReturn = (finalValue - initialCapital) / initialCapital;
  const annualReturn = (Math.pow(1 + totalReturn, 1/years) - 1) * 100;
  
  // 最大回撤
  let peakValue = initialCapital;
  let maxDD = 0;
  for(const r of rows){
    if(r.total > peakValue) peakValue = r.total;
    const dd = (peakValue - r.total) / peakValue;
    if(dd > maxDD) maxDD = dd;
  }
  const maxDrawdown = maxDD * 100;

  // total withdrawn and IRR (considering withdrawals + final remaining)
  const cashflows = [];
  cashflows.push(-initialCapital);
  let totalWithdrawn = 0;
  for(const r of rows){ cashflows.push(r.withdrawal); totalWithdrawn += r.withdrawal; }
  // final remaining portfolio sold at end
  cashflows.push(rows[rows.length-1].total);
  const irrRate = computeIRR(cashflows);
  const irrPct = isNaN(irrRate) ? NaN : irrRate * 100;

  return {annualReturn, maxDrawdown, totalReturn: totalReturn * 100, totalWithdrawn, irr: irrPct};
}

function renderResults(rows, initialCapital){
  const tbody = $('results').querySelector('tbody');
  tbody.innerHTML = '';
  const labels = [];
  const totals = [];
  const nasdaqVals = [];
  const withdrawals = [];
  const cashVals = [];
  
  for(const r of rows){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.year}</td>
      <td>${r.nasdaqReturnPct.toFixed(2)}%</td>
      <td>¥${r.yearStart.toFixed(2)}</td>
      <td>¥${r.afterReturn.toFixed(2)}</td>
      <td>¥${r.withdrawal.toFixed(2)}</td>
      <td>¥${r.afterWithdraw.toFixed(2)}</td>
      <td>¥${r.nasdaq.toFixed(2)}</td>
      <td>¥${r.cash.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
    labels.push(r.year.toString());
    totals.push(Math.round(r.total * 100) / 100);
    nasdaqVals.push(Math.round(r.nasdaq * 100) / 100);
    withdrawals.push(Math.round(r.withdrawal * 100) / 100);
    cashVals.push(Math.round(r.cash * 100) / 100);
  }
  
  const metrics = calculateMetrics(rows, initialCapital);
  displayMetrics(metrics, rows[rows.length - 1].total, initialCapital);
  drawChartJS(labels, totals, nasdaqVals, cashVals, withdrawals);
}

function displayMetrics(metrics, finalValue, initialCapital){
  const metricsDiv = $('metrics');
  if(!metricsDiv) return;
  metricsDiv.innerHTML = `
    <div class="metric-item">
      <div class="metric-label">总收益率</div>
      <div class="metric-value" style="color: ${metrics.totalReturn >= 0 ? '#059669' : '#dc2626'}">${metrics.totalReturn.toFixed(2)}%</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">年化收益率</div>
      <div class="metric-value" style="color: ${metrics.annualReturn >= 0 ? '#059669' : '#dc2626'}">${metrics.annualReturn.toFixed(2)}%</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">最大回撤</div>
      <div class="metric-value" style="color: #dc2626">-${metrics.maxDrawdown.toFixed(2)}%</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">最终资产</div>
      <div class="metric-value">¥${finalValue.toFixed(2)}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">累计提取</div>
      <div class="metric-value">¥${metrics.totalWithdrawn ? metrics.totalWithdrawn.toFixed(2) : '0.00'}</div>
    </div>
    <div class="metric-item">
      <div class="metric-label">考虑提取的年化 (IRR)</div>
      <div class="metric-value" style="color: ${metrics.irr>=0 ? '#059669' : '#dc2626'}">${isNaN(metrics.irr) ? 'N/A' : metrics.irr.toFixed(2) + '%'}</div>
    </div>
  `;
}

function drawChartJS(labels, totals, nasdaqVals, cashVals, withdrawals){
  const ctx = $('chart').getContext('2d');
  
  // 销毁旧图表
  if(chart) chart.destroy();
  
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '总资产 (¥)',
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
          label: '纳斯达克 (¥)',
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
          label: '货币基金 (¥)',
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
        ,
        {
          type: 'bar',
          label: '提取金额 (¥)',
          data: withdrawals,
          backgroundColor: 'rgba(219,39,91,0.5)',
          borderColor: 'rgba(219,39,91,0.8)',
          borderWidth: 1,
          yAxisID: 'y'
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
              if(ctx.dataset.type === 'bar'){
                return ctx.dataset.label + ': ¥' + ctx.parsed.y.toFixed(2);
              }
              return ctx.dataset.label + ': ¥' + ctx.parsed.y.toFixed(2);
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
          title: { display: true, text: '资产价值 (¥)' },
          grid: { color: 'rgba(0,0,0,0.1)' },
          ticks: {
            callback: function(val){
              return '¥' + val.toLocaleString();
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
  const csv = '年份,纳斯达克收益率(%),年初总资产(¥),应用收益后(¥),提取金额(¥),提取后(¥),再平衡-纳斯达克(¥),再平衡-货币基金(¥)\n' + rows.join('\n');
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
