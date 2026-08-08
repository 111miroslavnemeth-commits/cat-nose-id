CAT NOSE ID — PROTOTYPE v0.3

v0.3 pridáva druhú vision vrstvu:
1. COCO-SSD nájde mačku.
2. Z bounding boxu sa vytvorí malá oblasť tváre.
3. V tejto oblasti sa otestujú viaceré kandidátne výrezy.
4. Kandidát sa vyberie podľa lokálneho kontrastu/štruktúry obrazu.
5. Aplikácia zobrazí "NOSE CANDIDATE".

DÔLEŽITÉ:
Toto ešte NIE JE natrénovaný detektor mačacieho nosa a NIE JE to biometrická
identifikácia. "NOSE CANDIDATE %" je iba experimentálne skóre kvality
kandidátneho výrezu. Nesmie sa prezentovať ako pravdepodobnosť, presnosť
ani istota, že ide o nos.

Prečo to robíme:
- máme teraz oddelené "cat detection" a "nose candidate" vrstvy,
- môžeme na reálnych videách zistiť, či kandidát sedí na nose,
- potom môžeme túto vrstvu nahradiť skutočným modelom trénovaným na
  anotovaných mačacích nosoch.

ĎALŠÍ KROK v0.4:
Nazbierať a anotovať dostatok obrázkov mačacích nosov a natrénovať alebo
použiť vhodný model s licenciou, ktorý bude vracať skutočný nose bounding box.

Až potom má zmysel robiť embedding a MATCH/UNKNOWN.
