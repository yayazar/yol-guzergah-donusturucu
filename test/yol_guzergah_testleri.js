#!/usr/bin/env node
/* ============================================================
   Yol Güzergahı Dönüştürücü -- otomatik testler
   Kullanım:
     node yol_guzergah_testleri.js yol_guzergah_donusturucu.html
     node yol_guzergah_testleri.js yol_guzergah_donusturucu.html altin_klasoru [tolerans_m]

   altin_klasoru: gerçek proje dosyaları. Her proje için aynı adla
     PROJE.ktb  +  PROJE_ALN.gsi  ve/veya  PROJE_PRF.gsi   (Netcad'in kendi çıktıları)
   Program aynı KTB'den ALN/PRF üretir ve Netcad'inkiyle karşılaştırır.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

const htmlPath = process.argv[2];
if (!htmlPath) { console.error('HTML dosya yolunu verin.'); process.exit(2); }
const html = fs.readFileSync(htmlPath, 'utf8');
const start = html.indexOf('const Engine = (function');
const end = html.indexOf('if (typeof module !== \'undefined\') module.exports = Engine;');
if (start < 0 || end < 0) { console.error('HTML içinde Engine bulunamadı.'); process.exit(2); }
const E = new Function(html.slice(start, end) + '\nreturn Engine;')();

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (detail ? '  → ' + detail : '')); }
}
const near = (a, b, t) => Math.abs(a - b) <= t;
const d2 = (p, q) => Math.hypot(p.E - q.E, p.N - q.N);
function maxDiffH(a, b, s0, s1, step) {
  let m = 0;
  for (let s = s0; s <= s1 + 1e-9; s += step) m = Math.max(m, d2(E.evalHorizontal(a, s), E.evalHorizontal(b, s)));
  return m;
}
function maxDiffV(a, b, s0, s1, step) {
  let m = 0;
  for (let s = s0; s <= s1 + 1e-9; s += step) m = Math.max(m, Math.abs(E.evalVertical(a, s) - E.evalVertical(b, s)));
  return m;
}

// ---------- test data ----------
// straight, right curve with spirals, R=0 corner, reverse curves, end
const PIS = [
  { name: 'P0', E: 1000, N: 2000, R: 0, Ls1: 0, Ls2: 0 },
  { name: 'P1', E: 1000, N: 2500, R: 200, Ls1: 40, Ls2: 40 },
  { name: 'P2', E: 1400, N: 2800, R: 0, Ls1: 0, Ls2: 0 },
  { name: 'P3', E: 1800, N: 2800, R: 150, Ls1: 0, Ls2: 0 },
  { name: 'P4', E: 1900, N: 3300, R: 300, Ls1: 30, Ls2: 30 },
  { name: 'P5', E: 2400, N: 3500, R: 0, Ls1: 0, Ls2: 0 },
];
const PVIS = [
  { station: 0, elev: 100, L: 0 },
  { station: 300, elev: 110, L: 80 },
  { station: 700, elev: 104, L: 60 },
  { station: 1000, elev: 107, L: 100 },   // collinear with next two? no
  { station: 1300, elev: 110, L: 50 },    // collinear: 700->1000->1300 not; 1000->1300->1600 yes
  { station: 1600, elev: 113, L: 0 },
];

console.log('\n[1] Düşey geometri');
{
  const v = E.computeVertical(PVIS);
  const par = v.filter(e => e.type === 'PARABOLA');
  for (const p of par) {
    const evc = p.station + p.L;
    const dl = 1e-4;
    const slopeIn = (E.evalVertical(v, p.station + dl) - E.evalVertical(v, p.station)) / dl;
    const slopeOut = (E.evalVertical(v, evc) - E.evalVertical(v, evc - dl)) / dl;
    ok(near(slopeIn, p.gIn, 1e-3) && near(slopeOut, p.gOut, 1e-3), `PK ${p.pviStation} rakoru BVC/EVC'de teğet`);
    ok(near(E.evalVertical(v, p.pviStation), p.pviElev + (p.gOut - p.gIn) * p.L / 8, 1e-6), `PK ${p.pviStation} tepe noktası sapması L·A/8`);
  }
  ok(!v.some(e => e.type === 'PARABOLA' && Math.abs(e.pviStation - 1300) < 1e-6), 'Eğim değişmeyen PVI rakor üretmiyor (K=L/0 yok)');
  const circ = E.computeVertical([{ station: 0, elev: 100, L: 0 }, { station: 100, elev: 140, L: 40, curveType: 'circ' }, { station: 200, elev: 100, L: 0 }]);
  const c = circ[1], evc = c.station + c.L;
  ok(near(E.evalVertical(circ, evc), circ[2].elev, 1e-6), 'Dairesel düşey kurp EVC kotu doğru (sıçrama yok)');
  const dl = 1e-5;
  ok(near((E.evalVertical(circ, evc) - E.evalVertical(circ, evc - dl)) / dl, -0.4, 1e-3), 'Dairesel düşey kurp EVC eğimi = gOut');
  const circA = E.computeVertical([{ station: 0, elev: 100, L: 0 }, { station: 100, elev: 130, L: 40, curveType: 'circ' }, { station: 200, elev: 120, L: 0 }]);
  const ca = circA[1];
  ok(near(E.evalVertical(circA, ca.station + ca.L), circA[2].elev, 1e-6) && near(E.evalVertical(circA, ca.station), ca.elev, 1e-9), 'Asimetrik eğimli dairesel kurp uçları kapanıyor');
}

console.log('\n[1b] LandXML düşey kurp türleri');
{
  // UnsymParaCurve lengthIn=40 lengthOut=80
  const pv = [{ station: 0, elev: 100, L: 0 }, { station: 200, elev: 110, L: 120, curveType: 'unsym', Lin: 40, Lout: 80 }, { station: 400, elev: 104, L: 0 }];
  const v = E.computeVertical(pv);
  const par = v.filter(e => e.type === 'PARABOLA');
  ok(par.length === 2 && near(par[0].station, 160, 1e-9) && near(par[1].station, 200, 1e-9) && near(v[3].station, 280, 1e-9), 'Asimetrik parabol BVC=PVI−Lin, EVC=PVI+Lout');
  const dl = 1e-5, sl = s => (E.evalVertical(v, s + dl) - E.evalVertical(v, s - dl)) / (2 * dl);
  ok(near(sl(160 + 1e-3), 0.05, 1e-4) && near(sl(280 - 1e-3), -0.03, 1e-4), 'Asimetrik parabol uçlarda teğet');
  ok(near(E.evalVertical(v, 200 - 1e-7), E.evalVertical(v, 200 + 1e-7), 1e-6) && near(sl(200 - 1e-3), sl(200 + 1e-3), 1e-4), 'Asimetrik parabol PVI altında sürekli ve teğet');
  const A = (-0.03 - 0.05), e = 40 * 80 / (2 * 120) * A;
  ok(near(E.evalVertical(v, 200), 110 + e, 1e-9), 'Asimetrik parabol PVI sapması = Lin·Lout/(2L)·A');
  const prf = E.writePRF(v);
  ok(E.checkPRF(prf, v).errors.length === 0, 'Asimetrik parabol PRF kontrolünden geçiyor', E.checkPRF(prf, v).errors.join(' | '));
  // CircCurve: length = HORIZONTAL length (Netcad convention, so Civil3D XML
  // and the Netcad KTB made from it give the same PRF); R = L/|sin th2 - sin th1|
  const Lc = 120;
  const pc = [{ station: 0, elev: 100, L: 0 }, { station: 300, elev: 112, L: Lc, curveType: 'circ', radius: 2000 }, { station: 600, elev: 106, L: 0 }];
  const vc = E.computeVertical(pc);
  const c = vc[1];
  const th1 = Math.atan(0.04), th2 = Math.atan(-0.02);
  const R = Lc / Math.abs(Math.sin(th2) - Math.sin(th1));
  const h1 = Lc * Math.cos(th1) / (Math.cos(th1) + Math.cos(th2));
  ok(near(c.station, 300 - h1, 1e-9) && near(c.L, Lc, 1e-9), 'CircCurve: uzunluk yatay boy, BVC = PVI - L·cosθ1/(cosθ1+cosθ2) (Netcad)');
  // point on the circle: distance to centre == R
  const cx = c.station + R * Math.sin(th1), cy = c.elev - R * Math.cos(th1);
  let worst = 0;
  for (let s = c.station; s <= c.station + c.L; s += c.L / 50) worst = Math.max(worst, Math.abs(Math.hypot(s - cx, E.evalVertical(vc, s) - cy) - R));
  ok(worst < 1e-6, `CircCurve noktaları R = L/|Δsin| dairesi üzerinde (maks ${worst.toExponential(1)} m)`);
  const pc2 = [{ station: 0, elev: 100, L: 0 }, { station: 300, elev: 112, L: 0, curveType: 'circ', radius: R }, { station: 600, elev: 106, L: 0 }];
  pc2[1].L = R * Math.abs(th2 - th1);
  ok(E.checkVerticalSource(E.computeVertical(pc2)).length === 0, 'Yay uzunluğu olarak yazılmış CircCurve length kabul ediliyor');
}

console.log('\n[2] Yatay geometri (daire-eşdeğer)');
{
  const h = E.computeHorizontal(PIS);
  const el = h.elements;
  const corner = el.find(e => e.type === 'STRAIGHT' && near(e.E, 1400, 1e-9) && near(e.N, 2800, 1e-9));
  ok(!!corner, 'R=0 kırık nokta eleman listesinde');
  if (corner) ok(d2(E.evalHorizontal(el, corner.station), { E: 1400, N: 2800 }) < 1e-9, 'R=0 kırık noktada konum doğru');
  for (let k = 0; k < el.length - 1; k++) {
    if (el[k].type !== 'CURVE') continue;
    const pt = E.evalHorizontal(el, el[k + 1].station);
    ok(d2(pt, el[k + 1]) < 1e-6, `PK ${el[k].station.toFixed(2)} kurbu PT koordinatında kapanıyor`);
  }
  ok(E.validateHorizontal(el).length === 0, 'İstasyonlar geri gitmiyor');
  const lz = [{ E: 0, N: 0, R: 0 }, { E: 0, N: 100, R: 0 }, { E: 100, N: 100, R: 0 }];
  ok(d2(E.evalHorizontal(E.computeHorizontal(lz).elements, 100), { E: 0, N: 100 }) < 1e-9, 'L şekilli güzergah köşeyi kesmiyor');
}

console.log('\n[3] Klotoidli geometri');
{
  const ex = E.computeHorizontalExact(PIS);
  for (let k = 0; k < ex.length - 1; k++) {
    const e = ex[k], nx = ex[k + 1];
    if (e.type !== 'SPIRAL' && e.type !== 'CURVE') continue;
    const p = E.evalHorizontal(ex, nx.station - 1e-9);
    ok(d2(p, nx) < 2e-3, `${e.type} (PK ${e.station.toFixed(2)}) sonu bir sonraki elemanın başına oturuyor`, d2(p, nx).toFixed(4) + ' m');
    const dA = E.evalHorizontalDir(ex, nx.station - 1e-4), dB = E.evalHorizontalDir(ex, nx.station + 1e-4);
    ok(Math.abs(E.normDelta(dA - dB)) < 1e-4, `PK ${nx.station.toFixed(2)} geçişinde doğrultu sürekli`);
  }
}

console.log('\n[4] Aralık kırpma');
{
  const h = E.computeHorizontal(PIS).elements;
  const cur = h.find(e => e.type === 'CURVE');
  const nxt = h[h.indexOf(cur) + 1];
  const mid = (cur.station + nxt.station) / 2, endS = h[h.length - 1].station;
  const c = E.clipHorizontal(h, mid, endS, 1);
  ok(c[0].type === 'CURVE', 'Kurp ortasından başlayan aralık CURVE ile başlıyor');
  ok(maxDiffH(h, c, mid, endS, 0.5) < 1e-6, 'Kırpılmış ve tam güzergah aynı konumu veriyor');
  const c2 = E.clipHorizontal(h, 0, nxt.station + 0.5, 1);
  ok(c2[c2.length - 1].type === 'EOP', 'Bitişe yakın düğüm varken EOP korunuyor');
  ok(c2.some(e => near(e.station, nxt.station, 1e-9)), 'Kurp sonu (PT) düğümü korunuyor');
  const ex = E.computeHorizontalExact(PIS);
  const exEnd = ex[ex.length - 1].station;
  ok(maxDiffH(ex, E.clipHorizontal(ex, 450, exEnd, 1), 450, exEnd, 0.5) < 1e-6, 'Klotoidli güzergahta kurp içinden kırpma (daire kısmı) doğru');
  const v = E.computeVertical(PVIS);
  const p = v.find(e => e.type === 'PARABOLA');
  const vs = p.station + p.L / 3, ve = v[v.length - 1].station;
  const vc = E.clipVertical(v, vs, ve, 1);
  ok(vc[0].type === 'PARABOLA' && near(vc[0].K, p.K, 1e-12), 'Rakor ortasından başlayan profil PARABOLA ile başlıyor, K aynı');
  ok(maxDiffV(v, vc, vs, ve, 0.25) < 1e-9, 'Kırpılmış ve tam profil aynı kotu veriyor');
  const circ = E.computeVertical([{ station: 0, elev: 100, L: 0 }, { station: 100, elev: 140, L: 40, curveType: 'circ' }, { station: 200, elev: 100, L: 0 }]);
  ok(maxDiffV(circ, E.clipVertical(circ, 90, 200, 1), 90, 200, 0.25) < 1e-9, 'Dairesel rakor içinden kırpma doğru');
}

console.log('\n[4b] Toleranstan yakın gerçek düğümler silinmiyor');
{
  const pv = [{ station: 0, elev: 100, L: 0 }, { station: 200, elev: 108, L: 60 }, { station: 230.6, elev: 108.4, L: 0 }, { station: 231.4, elev: 108.6, L: 0 }, { station: 500, elev: 100, L: 0 }];
  const v = E.computeVertical(pv);
  for (const tol of [0.5, 1, 2]) {
    const c = E.clipVertical(v, 0, 500, tol);
    const recs = E.parsePRFFile(E.writePRF(c));
    let m = 0;
    for (let s = 0; s <= 500; s += 0.1) m = Math.max(m, Math.abs(E.evalGsiV(recs, s) - E.evalVertical(v, s)));
    ok(m < 0.001, `PRF tolerans ${tol} m: EVC'ye yakın kırıklar korunuyor (maks kot farkı ${m.toFixed(4)} m)`);
  }
  const pis = [{ E: 0, N: 0, R: 0 }, { E: 0, N: 300, R: 100 }, { E: 300, N: 300.2, R: 0 }, { E: 300.5, N: 301, R: 0 }, { E: 600, N: 300, R: 0 }];
  const h = E.computeHorizontal(pis).elements;
  const L = h[h.length - 1].station;
  const recs = E.parseALNFile(E.writeALN(E.clipHorizontal(h, 0, L, 2)));
  let m = 0;
  for (let s = 0; s <= L; s += 0.1) { const a = E.evalGsiH(recs, s), b = E.evalHorizontal(h, s); m = Math.max(m, Math.hypot(a.E - b.E, a.N - b.N)); }
  ok(m < 0.002, `ALN tolerans 2 m: yakın kırık noktalar korunuyor (maks konum farkı ${m.toFixed(4)} m)`);
  const c2 = E.clipVertical(v, 0.4, 499.5, 1);
  ok(c2[0].station === 0.4 && c2[c2.length - 1].type === 'EOP' && c2[c2.length - 1].station === 499.5, 'Aralık uçları istenen PK\'da');
}

console.log('\n[5] GSI yaz → oku → kontrol');
{
  const h = E.computeHorizontal(PIS).elements;
  const ex = E.computeHorizontalExact(PIS);
  const aln = E.writeALN(h);
  const chk = E.checkALN(aln, h, ex);
  ok(chk.errors.length === 0, 'KTB ALN kontrolünde hata yok', chk.errors.join(' | '));
  ok(chk.warnings.length === 0, 'KTB ALN kontrolünde uyarı yok (tam daire-eşdeğer)', chk.warnings.join(' | '));
  const back = E.parseALNFile(aln);
  ok(back.length === h.length && back.every((r, k) => near(r.station, h[k].station, 6e-4) && r.type === h[k].type), 'ALN geri okunduğunda tüm kayıtlar aynı');
  const v = E.computeVertical(PVIS);
  const prf = E.writePRF(v);
  const pc = E.checkPRF(prf, v);
  ok(pc.errors.length === 0, 'PRF kontrolünde hata yok', pc.errors.join(' | '));
  // bad file must be caught
  const bad = aln.replace(/(71\.\.\.\.\+0+CURVE 72\.\.\.\.\+)(\d{16})/, (m, a, r) => a + String(Number(r) + 50000).padStart(16, '0'));
  ok(E.checkALN(bad, null, null).errors.length > 0, 'Yarıçapı bozulmuş ALN kontrolde yakalanıyor');
  const noEop = aln.split('\r\n').filter(l => !/EOP/.test(l)).join('\r\n');
  ok(E.checkALN(noEop, null, null).errors.some(x => /EOP/.test(x)), 'EOP\'siz ALN kontrolde yakalanıyor');
  const t = E.gsiTxtWord('71', '....', 'COKUZUNBIRMETIN_1234567');
  ok(t.length === 23, 'GSI metin kelimesi 16 karaktere kesiliyor');
}

console.log('\n[6] Klotoidli LandXML → GSI daire-eşdeğer');
{
  const ex = E.computeHorizontalExact(PIS);
  const col = E.collapseForGSI(ex);
  const chk = E.checkALN(E.writeALN(col), col, ex);
  ok(chk.errors.length === 0, 'Daire-eşdeğer kurplar kapanıyor ve teğet', chk.errors.join(' | '));
  const circ = E.computeHorizontal(PIS).elements;
  const cc = col.filter(e => e.type === 'CURVE'), kc = circ.filter(e => e.type === 'CURVE');
  ok(cc.length === kc.length && cc.every((c, k) => d2(c, kc[k]) < 1e-6), 'Kurp başı koordinatları KTB daire-eşdeğer yöntemiyle aynı');
  const shift = Math.max(...cc.map(c => Math.abs(c.stationShift || 0)));
  ok(shift < 0.5, `Spiral kaynaklı PK farkı makul (${shift.toFixed(3)} m)`);
}

console.log('\n[7] Nokta araçları');
{
  const ex = E.computeHorizontalExact(PIS);
  const endS = ex[ex.length - 1].station;
  let worstS = 0, worstO = 0;
  for (let s = 5; s < endS - 5; s += 37.3) {
    for (const o of [-7.5, 0, 3.25]) {
      const p = E.pointAt(ex, s, o);
      const r = E.stationOffsetOf(ex, p.E, p.N);
      worstS = Math.max(worstS, Math.abs(r.station - s)); worstO = Math.max(worstO, Math.abs(r.offset - o));
    }
  }
  ok(worstS < 1e-3 && worstO < 1e-3, `PK/offset → koordinat → PK/offset gidiş-dönüş (maks ${worstS.toExponential(1)} / ${worstO.toExponential(1)} m)`);
  const r = E.stationOffsetOf(ex, 990, 1990);
  ok(r.outside, 'Güzergahın başlangıcından önceki nokta "dışında" işaretleniyor');
  ok(E.formatPK(1234.567) === '1+234.57' && E.formatPK(999.999) === '1+000.00' && E.formatPK(5) === '0+005.00', 'PK biçimi (km+m)');
  const v = E.computeVertical(PVIS);
  const xs = [{ station: 100, points: [{ offset: -5, elev: 10, label: 'A' }, { offset: 5, elev: 20, label: 'B' }] },
    { station: 110, points: [{ offset: -5, elev: 12, label: 'A' }, { offset: 5, elev: 22, label: 'B' }] }];
  ok(near(E.xsElevation(xs, 105, 0), 16, 1e-9), 'Enkesitten ara kot enterpolasyonu');
  ok(E.xsElevation(xs, 105, 9) === null, 'Enkesit dışındaki offset için kot üretilmiyor');
  const rows = E.generateStakeout({ horizontal: ex, vertical: v, crossSections: null, sStart: 0, sEnd: 500, interval: 20, offsets: [-3.5, 0, 3.5], keyPoints: true });
  ok(rows.length % 3 === 0 && rows.some(x => /TS/.test(x.tag)) && rows.some(x => /BVC/.test(x.tag)), 'Aplikasyon tablosu: ara noktalar + TS/BVC ana noktaları');
  ok(rows.every((x, k) => k === 0 || x.station >= rows[k - 1].station - 1e-9), 'Aplikasyon tablosu PK sıralı');
}

console.log('\n[8] KTB okuma');
{
  const k = E.parseKTB('$YATAY\nA 0 0\nB 0,5 500 200 1 0 0 0\nC +500 5.0E+2\nbozuk\n$SON\n$DUSEY\n0 100\n250 110 50\n900 105\n$SON');
  ok(k.pis.length === 3 && k.pvis.length === 3, 'Eksik sütunlu satırlar okunuyor');
  ok(near(k.pis[1].E, 0.5, 1e-12) && near(k.pis[2].N, 500, 1e-12), 'Virgüllü ondalık ve üslü sayı');
  ok(k.skipped.length === 1, 'Okunamayan satır raporlanıyor');
}

{
  // full Netcad rows present: a short row in the middle is not geometry
  const k = E.parseKTB('$YATAY\nP0 0 0\n6 0 0\nP1 0 500 200 1 0 0 0\nP2 500 500 0 0 0 0 0\nP3 500 900\n$SON\n$DUSEY\n6 3\n0 100 0\n400 110 50\n900 105 0\n$SON');
  ok(k.pis.map(p => p.name).join() === 'P0,P1,P2,P3', 'Tam satırlı KTB: aradaki kısa satır nokta sayılmıyor, baş/son kısa satır okunuyor');
  ok(k.pvis.length === 3 && k.pvis[0].station === 0, 'Tam satırlı $DUSEY: baştaki sayaç satırı PVI sayılmıyor');
}

{
  // Netcad $DUSEY row: PK KOT L tip T1 T2 R (GUZERGAH-3.KTB) -- Netcad's own PRF
  // puts BVC at PK-T1 and EVC at PK+T2 and writes K x 100 with one decimal
  const k = E.parseKTB('$YATAY\nA 0 0 0 1 0 0 0\nB 0 1000 0 1 0 0 0\n$SON\n$DUSEY\n    0.00000  332.00000    0.00000    0\n  148.66252  347.64219    7.24349    1    3.66883    3.57466   50.84047\n  279.28211  380.95360    0.00000    0\n$SON');
  const v = E.computeVertical(k.pvis);
  ok(near(v[1].station, 144.99369, 1e-5) && near(v[2].station, 152.23718, 1e-5), 'KTB düşey kurp: BVC = PK - T1, EVC = PK + T2 (Netcad)');
  const prf = E.writePRF(v).split('\r\n');
  ok(prf[2].includes('72....+0000000000048400') && prf[2].includes('83..10+0000000000347256'), 'PRF: K x100 tek ondalık, BVC kotu Netcad ile aynı');
}

console.log('\n[9] Enkesit (KSP/KSE) okuma ve kod birleşimi');
{
  const a = E.parseKSP('1 1 0+020,50 x\n0 -3,5 101,2 3,HDA\n0 2 101 KDA SAĞ\n1 2 40 x\n0 -3.5 101.4 HDA\n');
  ok(a.length === 2 && near(a[0].station, 20.5, 1e-9) && a[0].points[1].label === 'KDA SAĞ', 'KSE: "0+020,50" PK, virgüllü sayı, boşluklu kod');
  const b = E.parseKSP('PK 0+000.00\n-6 99.7 SEV\n0 100 EKS\nPK=20\n-6 99.9 SEV\n');
  ok(b.length === 2 && b[1].station === 20 && b[1].points.length === 1, 'KSE: "PK ..." başlıklı serbest biçim');
  // SA exists on both sides at 0 and 40, but only on the right at 20:
  // the right-hand point must not be joined to the left line
  const xs = [0, 20, 40].map(st => ({ station: st, points: [
    ...(st === 20 ? [] : [{ offset: -3.5, elev: 100, label: 'SA' }]),
    { offset: 0, elev: 100.1, label: 'EKS' }, { offset: 3.5, elev: 100, label: 'SA' }] }));
  const h = E.computeHorizontal([{ name: 'A', E: 0, N: 0, R: 0 }, { name: 'B', E: 0, N: 100, R: 0 }]).elements;
  const bl = E.buildCrossSectionBreaklines(xs, h);
  const left = bl.find(l => l.name === 'SA (sol)'), right = bl.find(l => l.name === 'SA (sağ)');
  ok(left && right && left.points.every(p => p.E < 0) && right.points.every(p => p.E > 0) && right.points.length === 3,
    'Kod birleşimi taraf ayrımlı: sağdaki nokta soldaki çizgiye bağlanmıyor');
  const sum = E.summarizeCodes(xs);
  ok(sum.find(r => r.code === 'SA (sol)').count === 2 && sum.find(r => r.code === 'EKS (eks)').lines === 1, 'Kod özeti: kesit ve çizgi sayıları');
}

// ---------- golden files ----------
const goldenDir = process.argv[3];
if (goldenDir) {
  const tol = Number(process.argv[4]) || 0.05;
  console.log(`\n[Altın] ${goldenDir} (tolerans ${tol} m)`);
  const dec = b => { try { return new TextDecoder('windows-1254').decode(b); } catch (e) { return b.toString('latin1'); } };
  const files = fs.readdirSync(goldenDir);
  for (const f of files.filter(x => /\.ktb$/i.test(x))) {
    const base = f.replace(/\.ktb$/i, '');
    const ktb = E.parseKTB(dec(fs.readFileSync(path.join(goldenDir, f))));
    const h = E.computeHorizontal(ktb.pis).elements;
    const v = E.computeVertical(ktb.pvis);
    const find = suf => files.find(x => x.toLowerCase() === (base + suf).toLowerCase());
    const match = (ref, comp, key) => {
      let worst = 0, missing = 0;
      for (const r of ref) {
        let best = null;
        for (const c of comp) if ((!best || Math.abs(c.station - r.station) < Math.abs(best.station - r.station))) best = c;
        if (!best || Math.abs(best.station - r.station) > 50) { missing++; continue; }
        const d = key === 'h' ? Math.max(Math.abs(best.station - r.station), Math.hypot(best.E - r.E, best.N - r.N)) : Math.max(Math.abs(best.station - r.station), Math.abs(best.elev - r.elev));
        worst = Math.max(worst, d);
      }
      return { worst, missing };
    };
    const a = find('_ALN.gsi');
    if (a) {
      const ref = E.parseALNFile(dec(fs.readFileSync(path.join(goldenDir, a))));
      const comp = E.parseALNFile(E.writeALN(E.clipHorizontal(h, ref[0].station, ref[ref.length - 1].station, 1)));
      const m = match(ref, comp, 'h');
      ok(m.worst <= tol && !m.missing, `${base}: ALN Netcad ile uyumlu (maks fark ${m.worst.toFixed(3)} m, eşleşmeyen ${m.missing})`);
    }
    const pr = find('_PRF.gsi');
    if (pr) {
      const ref = E.parsePRFFile(dec(fs.readFileSync(path.join(goldenDir, pr))));
      const comp = E.parsePRFFile(E.writePRF(E.clipVertical(v, ref[0].station, ref[ref.length - 1].station, 1)));
      const m = match(ref, comp, 'v');
      ok(m.worst <= tol && !m.missing, `${base}: PRF Netcad ile uyumlu (maks fark ${m.worst.toFixed(3)} m, eşleşmeyen ${m.missing})`);
    }
    if (!a && !pr) console.log(`  – ${base}: karşılaştırılacak _ALN.gsi / _PRF.gsi yok`);
  }
}

console.log(`\nSonuç: ${pass} geçti, ${fail} kaldı.`);
process.exit(fail ? 1 : 0);
