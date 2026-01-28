// 回测逻辑和UI交互
function $(id){return document.getElementById(id)}

let yearlyReturns = {}; // {year: percent}

function parseCSV(text){
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(l=>l);
  const map = {};
  for(const line of lines){
    const parts = line.split(/[,\s]+/);
    if(parts.length<2) continue;
    const y = parseInt(parts[0]);
    const v = parseFloat(parts[1]);
    if(!isNaN(y) && !isNaN(v)) map[y]=v;
  }
  return map;
}

function loadFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    yearlyReturns = parseCSV(reader.result);
    alert('已读取 ' + Object.keys(yearlyReturns).length + ' 年的数据（示例/自备数据）。');
  };
  reader.readAsText(file);
}

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
  const vals = [];
  for(const r of rows){
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.year}</td><td>${r.total.toFixed(2)}</td><td>${r.nasdaq.toFixed(2)}</td><td>${r.cash.toFixed(2)}</td>`;
    tbody.appendChild(tr);
    labels.push(r.year);
    vals.push(r.total);
  }
  drawChart(labels, vals);
}

function drawChart(labels, vals){
  const c = $('chart');
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,c.width,c.height);
  if(vals.length===0) return;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const pad = 20;
  const w = c.width - pad*2;
  const h = c.height - pad*2;
  ctx.beginPath();
  ctx.strokeStyle = '#1f77b4';
  ctx.lineWidth = 2;
  for(let i=0;i<vals.length;i++){
    const x = pad + (i/(vals.length-1||1)) * w;
    const y = pad + (1 - (vals[i]-min)/(max-min||1)) * h;
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.stroke();
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
  $('file').addEventListener('change', e=>{
    const f = e.target.files[0]; if(f) loadFile(f);
  });
  $('run').addEventListener('click', runBacktest);
  $('download').addEventListener('click', downloadCSV);
  $('loadSample').addEventListener('click', ()=>{
    // 简单占位示例：从2020到2026，示例值（仅示例）
    yearlyReturns = {2020:30,2021:20,2022:-25,2023:45,2024:10,2025:8,2026:5};
    alert('已载入示例年度收益（仅示例，请替换为真实数据）');
  });
  
  // Auto-load real QQQ annual returns from CSV
  fetch('qqq_annual_returns.csv')
    .then(r=>r.text())
    .then(text=>{
      yearlyReturns = parseCSV(text);
      const years = Object.keys(yearlyReturns).sort((a,b)=>a-b);
      if(years.length>0){
        const minYear = Math.min(...years.map(y=>parseInt(y)));
        const maxYear = Math.max(...years.map(y=>parseInt(y)));
        $('startYear').value = minYear;
        $('endYear').value = maxYear;
        console.log('已自动加载 QQQ 年度收益数据 (' + years.length + ' 年)');
      }
    })
    .catch(()=>console.log('未找到 qqq_annual_returns.csv，请手动上传或点击示例按钮'));
});
