const fs = require('fs');
const https = require('https');
const path = require('path');

function fetchJson(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', (err) => {
      console.warn(`Fetch error for ${url}:`, err.message);
      resolve([]);
    });
  });
}

// 目標食品股代碼
const TARGET_CODES = [
  '1201', '1203', '1210', '1213', '1215', '1216', '1217', '1218', '1219', '1220',
  '1225', '1227', '1229', '1231', '1232', '1233', '1234', '1235', '1236', '1240',
  '1256', '1259', '1264', '1268', '1294', '1295', '1702', '1737', '2912', '4205',
  '4419', '5903', '7743', '7780', '7791'
];

async function sync() {
  console.log('開始同步台股食品類上市公司與上櫃公司即時報價...');

  // 1. 抓取上市全部收盤行情與本益比/殖利率
  const [twseQuotes, twseBw, tpexQuotes, tpexBw] = await Promise.all([
    fetchJson('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'),
    fetchJson('https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL'),
    fetchJson('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'),
    fetchJson('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis')
  ]);

  console.log(`TWSE 報價: ${twseQuotes.length} 筆, TWSE 估值: ${twseBw.length} 筆`);
  console.log(`TPEx 報價: ${tpexQuotes.length} 筆, TPEx 估值: ${tpexBw.length} 筆`);

  const result = {
    updated_at: new Date().toISOString(),
    stocks: {}
  };

  // 建立 TWSE 索引
  const twseMap = {};
  twseQuotes.forEach(q => { twseMap[q.Code] = q; });
  const twseBwMap = {};
  twseBw.forEach(b => { twseBwMap[b.Code] = b; });

  // 建立 TPEx 索引
  const tpexMap = {};
  tpexQuotes.forEach(q => { tpexMap[q.SecuritiesCompanyCode] = q; });
  const tpexBwMap = {};
  tpexBw.forEach(b => { tpexBwMap[b.SecuritiesCompanyCode] = b; });

  TARGET_CODES.forEach(code => {
    if (twseMap[code]) {
      const q = twseMap[code];
      const bw = twseBwMap[code] || {};
      result.stocks[code] = {
        code: code,
        name: q.Name,
        market: 'TWSE',
        price: parseFloat(q.ClosingPrice) || null,
        change: parseFloat(q.Change) || 0,
        volume: parseInt(q.TradeVolume) || 0,
        pe: parseFloat(bw.PEratio) || null,
        yield: parseFloat(bw.DividendYield) || null,
        pb: parseFloat(bw.PBratio) || null,
        date: q.Date
      };
    } else if (tpexMap[code]) {
      const q = tpexMap[code];
      const bw = tpexBwMap[code] || {};
      result.stocks[code] = {
        code: code,
        name: q.CompanyName,
        market: 'TPEX',
        price: parseFloat(q.Close) || null,
        change: parseFloat(q.Change) || 0,
        volume: parseInt(q.TradingShares) || 0,
        pe: parseFloat(bw.PriceEarningRatio) || null,
        yield: parseFloat(bw.YieldRatio) || null,
        pb: parseFloat(bw.PriceBookRatio) || null,
        date: q.Date
      };
    }
  });

  const outDir = path.join(__dirname, '../data');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'stock_quotes.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`成功同步 ${Object.keys(result.stocks).length} 檔食品股行情至: ${outPath}`);
}

sync();
