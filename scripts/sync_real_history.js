const fs = require('fs');
const https = require('https');
const path = require('path');

function get(url) {
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// 35 檔食品股名單及上市/上櫃市場判斷
const TARGET_STOCKS = [
  { code: '1216', name: '統一', market: 'TWSE' },
  { code: '1210', name: '大成', market: 'TWSE' },
  { code: '1215', name: '卜蜂', market: 'TWSE' },
  { code: '1232', name: '大統益', market: 'TWSE' },
  { code: '2912', name: '統一超', market: 'TWSE' },
  { code: '1229', name: '聯華', market: 'TWSE' },
  { code: '1201', name: '味全', market: 'TWSE' },
  { code: '1203', name: '味王', market: 'TWSE' },
  { code: '1213', name: '大飲', market: 'TWSE' },
  { code: '1217', name: '愛之味', market: 'TWSE' },
  { code: '1218', name: '泰山', market: 'TWSE' },
  { code: '1219', name: '福壽', market: 'TWSE' },
  { code: '1220', name: '台榮', market: 'TWSE' },
  { code: '1225', name: '福懋油', market: 'TWSE' },
  { code: '1227', name: '佳格', market: 'TWSE' },
  { code: '1231', name: '聯華食', market: 'TWSE' },
  { code: '1233', name: '天仁', market: 'TWSE' },
  { code: '1234', name: '黑松', market: 'TWSE' },
  { code: '1235', name: '興泰', market: 'TWSE' },
  { code: '1236', name: '宏亞', market: 'TWSE' },
  { code: '1240', name: '茂生農經', market: 'TPEX' },
  { code: '1256', name: '鮮活果汁-KY', market: 'TWSE' },
  { code: '1259', name: '安心', market: 'TPEX' },
  { code: '1264', name: '德麥', market: 'TPEX' },
  { code: '1268', name: '漢來美食', market: 'TPEX' },
  { code: '1294', name: '漢田生技', market: 'TPEX' },
  { code: '1295', name: '生合', market: 'TPEX' },
  { code: '1702', name: '南僑', market: 'TWSE' },
  { code: '1737', name: '臺鹽', market: 'TWSE' },
  { code: '4205', name: '中華食', market: 'TPEX' },
  { code: '4419', name: '皇家美食', market: 'TPEX' },
  { code: '5903', name: '全家', market: 'TPEX' },
  { code: '7743', name: '金利食安', market: 'TPEX' },
  { code: '7780', name: '大研生醫', market: 'TWSE' },
  { code: '7791', name: '皇家可口', market: 'TWSE' }
];

async function syncRealData() {
  console.log('開始從 Yahoo Finance 與 TWSE 獲取 35 檔真實日線行情與即時最新價格...');
  const now = Math.floor(Date.now() / 1000);
  const oneYearAgo = now - 365 * 86400;

  // 1. 抓取 TWSE MIS 即時跳動行情
  const exChs = TARGET_STOCKS.map(s => (s.market === 'TPEX' ? 'otc_' + s.code + '.tw' : 'tse_' + s.code + '.tw')).join('|');
  const misUrl = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=' + exChs + '&json=1&delay=0';
  const misRes = await get(misUrl);
  const misMap = {};
  if (misRes && misRes.msgArray) {
    misRes.msgArray.forEach(m => {
      misMap[m.c] = {
        price: parseFloat(m.z) || parseFloat(m.y) || 0,
        prevClose: parseFloat(m.y) || 0,
        open: parseFloat(m.o) || 0,
        high: parseFloat(m.h) || 0,
        low: parseFloat(m.l) || 0,
        volume: parseInt(m.v) || 0,
        time: m.t
      };
    });
  }
  console.log(`TWSE MIS 即時價格取得筆數: ${Object.keys(misMap).length}`);

  const stockHistoryMap = {};

  // 2. 依序抓取 Yahoo Finance 真實日 K 線
  for (const item of TARGET_STOCKS) {
    const symbol = item.market === 'TPEX' ? `${item.code}.TWO` : `${item.code}.TW`;
    const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${oneYearAgo}&period2=${now}&interval=1d`;
    const yRes = await get(yUrl);

    let dates = [];
    let prices = [];
    let volumes = [];

    if (yRes && yRes.chart && yRes.chart.result && yRes.chart.result[0]) {
      const result = yRes.chart.result[0];
      const timestamps = result.timestamp || [];
      const quote = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
      const closes = quote.close || [];
      const vols = quote.volume || [];

      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] !== null && closes[i] !== undefined) {
          const d = new Date(timestamps[i] * 1000);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          dates.push(`${y}/${m}/${day}`);
          prices.push(parseFloat(closes[i].toFixed(2)));
          volumes.push(Math.round((vols[i] || 0) / 1000)); // 轉為張數
        }
      }
    }

    // 若 Yahoo 取回無效或不足，保留備援
    const live = misMap[item.code] || {};
    const curPrice = live.price || (prices.length > 0 ? prices[prices.length - 1] : 50.0);
    const prevClose = live.prevClose || (prices.length > 1 ? prices[prices.length - 2] : curPrice);
    const change = parseFloat((curPrice - prevClose).toFixed(2));
    const changePct = prevClose > 0 ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0;

    // 若有當天即時報價，確保最後一根即時更新
    if (prices.length > 0 && curPrice > 0) {
      prices[prices.length - 1] = curPrice;
      if (live.volume > 0) volumes[volumes.length - 1] = live.volume;
    }

    stockHistoryMap[item.code] = {
      code: item.code,
      name: item.name,
      market: item.market,
      dates: dates,
      prices: prices,
      volumes: volumes,
      currentPrice: curPrice,
      prevClose: prevClose,
      change: change,
      changePct: changePct,
      volume: live.volume || (volumes.length > 0 ? volumes[volumes.length - 1] : 0),
      updateTime: new Date().toISOString()
    };

    console.log(`[${item.code} ${item.name}] 日K線: ${prices.length} 天, 現價: ${curPrice}, 漲跌: ${change} (${changePct}%)`);
  }

  const outDir = path.join(__dirname, '../data');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'realtime_stock_history.json');
  fs.writeFileSync(outPath, JSON.stringify(stockHistoryMap, null, 2), 'utf8');
  console.log(`成功匯出 35 檔真實市場歷史日K線與即時價格至: ${outPath}`);
}

syncRealData();
