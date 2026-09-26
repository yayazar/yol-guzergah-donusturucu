# Yol güzergah dönüştürücü

Tarayıcıda çalışan tek sayfalık araç. Netcad KTB ya da Civil3D/Netcad LandXML güzergahını Leica GSI-16 ALN ve PRF dosyalarına çevirir. GNSS aplikasyonu için bir LandXML dosyası da üretir.

- **Girdi:** `.ktb` (Netcad) ya da `.xml` / `.landxml` (LandXML). İsteğe bağlı olarak `.ksp` / `.kse` enkesit dosyası da eklenebilir.
- **Çıktı:** ALN ve PRF (GSI-16, Windows-1254, CRLF) ile GNSS için LandXML.
- **Gizlilik:** Tüm hesaplar tarayıcıda yapılır. Yüklenen dosyalar hiçbir sunucuya gönderilmez.

## Kullanım

`index.html` dosyasını tarayıcıda açın ya da Vercel adresini kullanın.

## Testler

```
node test/yol_guzergah_testleri.js index.html
node test/yol_guzergah_testleri.js index.html <altın_klasör> 0.0005
```

Altın klasör, Netcad çıktılarıyla karşılaştırma içindir. İçinde `AD.KTB`, `AD_ALN.gsi` ve `AD_PRF.gsi` bulunur.
