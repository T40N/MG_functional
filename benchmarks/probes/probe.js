/**
 * probe.js — sonda rozdzielajaca warstwy w scenariuszu S3.
 *
 * Sluzy jednemu celowi: ustaleniu, GDZIE powstaje anomalia S3 (implementacja
 * funkcyjna istotnie szybsza pod obciazeniem, wbrew hipotezom H2–H4). Scenariusz
 * s3_products_list.js mierzy cala sciezke naraz — warstwe HTTP, kod aplikacji
 * i baze danych. Sonda pozwala mierzyc te warstwy osobno.
 *
 * Tryby (PROBE_PATH):
 *   diag  — GET /api/diagnostics: warstwa HTTP i kod aplikacji BEZ udzialu bazy.
 *           Trasa jest w obu implementacjach niemal identyczna (odczyt licznikow
 *           i res.json), wiec mierzy czysty koszt organizacji kodu.
 *   list  — GET /api/products?category_id&page&limit: dokladnie zapytanie S3,
 *           z ta sama rotacja kategorii i stron. LIMIT jest parametrem sondy,
 *           zeby sprawdzic, czy roznica skaluje sie z liczba zwracanych wierszy.
 *
 * Staly poziom obciazenia (VUS przez DURATION), bez rampy: okno pomiaru ma byc
 * jednorodne, bo porownujemy koszt na zadanie, a nie zachowanie przy narastaniu
 * obciazenia (to mierza profile A–D w run_single.sh).
 *
 * Uruchamiane przez run_probe.sh — patrz benchmarks/probes/README.md.
 */
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL;
const MODE     = __ENV.PROBE_PATH || 'list';
const LIMIT    = __ENV.LIMIT || '20';
const OUT      = __ENV.SUMMARY_OUT;

export const options = {
  // Bramki celowo puste — z tego samego powodu co w profilach A–D:
  // przekroczenie progu konczy proces k6 kodem 99 i kasuje udany pomiar.
  thresholds: {},
  vus: Number(__ENV.VUS || 100),
  duration: __ENV.DURATION || '45s',
};

export default function () {
  let url;
  if (MODE === 'diag') {
    url = `${BASE_URL}/api/diagnostics`;
  } else {
    // Rotacja identyczna jak w s3_products_list.js — te same parametry zapytania,
    // wiec ten sam plan i ten sam wpis w pg_stat_statements.
    const categoryId = ((__VU + __ITER) % 20) + 1;
    const page       = (__ITER % 50) + 1;
    url = `${BASE_URL}/api/products?category_id=${categoryId}&page=${page}&limit=${LIMIT}`;
  }
  const res = http.get(url, { tags: { name: MODE } });
  check(res, { 'status 200': (r) => r.status === 200 });
}

export function handleSummary(data) {
  const out = {};
  if (OUT) out[OUT] = JSON.stringify(data);
  return out;
}
