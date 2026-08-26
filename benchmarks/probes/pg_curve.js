/**
 * pg_curve.js — krzywa przepustowosci Postgresa wobec liczby rownoleglych zapytan.
 *
 * Mierzy SAM SERWER BAZY DANYCH, bez udzialu obu aplikacji: wykonuje dokladnie
 * to zapytanie, ktorego uzywa S3 (identyczne w obu implementacjach), z N
 * rownoleglymi klientami przez DURATION_MS, dla kolejnych N z LEVELS.
 *
 * Po co: anomalia S3 znika, gdy sie zalozy, ze baza jest liniowa. Nie jest.
 * Kontener Postgresa ma limit 2 rdzeni (docker-compose.yml), a zapytanie S3 jest
 * w calosci procesorowe (bitmapowy odczyt 5000 wierszy + sortowanie top-N,
 * wszystko z shared buffers, zero wejscia-wyjscia). Powyzej kolana krzywej
 * przepustowosc SPADA z rosnaca rownoleglscia — i wlasnie w tym obszarze
 * pracuja obie aplikacje przy 100 i 200 VU.
 *
 * Uruchomienie (wewnatrz kontenera aplikacji, bo tam jest zainstalowany pg):
 *   docker cp benchmarks/probes/pg_curve.js mg_oop:/tmp/pg_curve.js
 *   docker exec -e DB_HOST=postgres -e DB_PORT=5432 -e DB_NAME=postgres \
 *     -e DB_USER=postgres -e DB_PASSWORD=postgres -e DURATION_MS=10000 \
 *     mg_oop node /tmp/pg_curve.js
 *
 * Wybor kontenera (mg_oop czy mg_functional) nie ma znaczenia — skrypt nie uzywa
 * kodu aplikacji, tylko sterownika pg.
 */
const { Pool } = require('/app/node_modules/pg');

// Zapytanie przepisane znak w znak z ProductRepository.findAll / getProductsFromDb.
const SQL = `
    SELECT id, name, description, price, stock, category_id as "categoryId", created_at as "createdAt"
    FROM products
    WHERE category_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `;

const DURATION = Number(process.env.DURATION_MS || 10000);
const LEVELS = (process.env.LEVELS || '1,2,3,4,5,6,7,8,10,14').split(',').map(Number);

const cfg = {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function level(n) {
  // max = n, wiec liczba polaczen w bazie rowna sie liczbie pracownikow:
  // kazdy pracownik ma wlasne polaczenie i nie czeka w kolejce puli.
  const pool = new Pool({ ...cfg, max: n });
  await Promise.all(Array.from({ length: n }, (_, i) => pool.query(SQL, [(i % 20) + 1, 20, 0])));

  let done = 0, totalMs = 0, stop = false;
  const worker = async (id) => {
    let iter = 0;
    while (!stop) {
      const cat = ((id + iter) % 20) + 1;
      const page = (iter % 50) + 1;
      const t = process.hrtime.bigint();
      await pool.query(SQL, [cat, 20, (page - 1) * 20]);
      totalMs += Number(process.hrtime.bigint() - t) / 1e6;
      done++; iter++;
    }
  };
  const workers = Array.from({ length: n }, (_, i) => worker(i));
  await sleep(DURATION);
  stop = true;
  await Promise.all(workers);
  await pool.end();
  return { n, qps: +(done / (DURATION / 1000)).toFixed(1), meanMs: +(totalMs / done).toFixed(3), done };
}

(async () => {
  const rows = [];
  for (const n of LEVELS) {
    const r = await level(n);
    rows.push(r);
    console.log(`N=${String(r.n).padStart(2)}  qps=${String(r.qps).padStart(7)}  mean=${String(r.meanMs).padStart(7)} ms  (zapytan: ${r.done})`);
    await sleep(1500); // wyciszenie miedzy poziomami
  }
  console.log('\nJSON ' + JSON.stringify(rows));
})();
