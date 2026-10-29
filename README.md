# ⌨️ Auto Typer voor Google Docs (iPad)

Typt je tekst letter voor letter in een Google Doc, alsof je hem zelf typt. Je stelt zelf in:

- hoe snel hij typt (**woorden per minuut**)
- **menselijke variatie** (niet robotachtig: de tijd tussen letters wisselt)
- **pauzes** na een zin en na een alinea
- **tikfouten** die hij meteen zelf verbetert
- **aftellen** voordat hij begint

Met knoppen voor **Start, Pauze/Verder en Stop**, een **voortgangsbalk** en de **resterende tijd**.

Werkt in **Safari** op de iPad. In de Google Docs-app werkt het niet.

---

## Installeren (doe je één keer)

1. Installeer de gratis app **[Userscripts](https://apps.apple.com/app/userscripts/id1463298887)** uit de App Store (van Justin Wasack).
2. Open de app één keer. Hij maakt dan zelf een map voor je scripts.
3. Zet de extensie aan in Safari:
   **Instellingen → Apps → Safari → Extensies → Userscripts** → zet hem **aan**.
   Zet bij de toestemming *Andere websites* op **Sta toe**.
   *(Op een oudere iPad heet het: Instellingen → Safari → Extensies.)*
4. Open deze link in **Safari** op je iPad:
   **https://raw.githubusercontent.com/Wander2026projects/Auto-typer/main/auto-typer.user.js**
5. Tik in de adresbalk op het **puzzelstukje** (of op **aA**) → **Userscripts**. Tik op de melding dat er een userscript is gevonden → **Installeer**.

Klaar! Open nu een Google Doc in Safari. Rechtsboven verschijnt het paneel **⌨️ Auto Typer**.

> **Vraagt Google of je de app wilt openen?** Blijf in de browser.
> **Zie je een simpele versie van Google Docs zonder menu's?** Tik op **aA** in de adresbalk → **Vraag desktopwebsite aan**.

---

## Gebruiken

1. Open je document op **docs.google.com** in Safari.
2. Plak je tekst in het vak van de Auto Typer.
3. Stel bij **Instellingen** de snelheid en de rest in.
4. Tik in je document op de plek waar de tekst moet komen.
5. Druk op **▶ Start**. Na het aftellen begint hij met typen.

| Knop | Wat het doet |
|---|---|
| ▶ Start | Begint met typen (na het aftellen) |
| ⏸ Pauze / ▶ Verder | Typen even stilzetten en verder laten gaan |
| ■ Stop | Helemaal stoppen |
| Esc (op je toetsenbord) | Pauze |
| – (rechtsboven in het paneel) | Paneel klein maken. Er blijft dan een rond knopje over dat laat zien hoe ver hij is |

Je kunt het paneel verslepen aan de blauwe balk bovenaan. Je tekst, je instellingen en de plek van het paneel worden onthouden.

### Instellingen

| Instelling | Uitleg | Standaard |
|---|---|---|
| Snelheid | Woorden per minuut (10–300). Een gemiddeld mens typt 35–45. | 45 |
| Menselijke variatie | 0% = elke letter precies even snel (robot). Hoe hoger, hoe natuurlijker en ongelijker. Hij neemt soms ook even "denktijd" voor een woord. | 50% |
| Pauze na een zin | Extra wachten na `.` `!` `?` (na een komma ongeveer een derde hiervan) | 0,6 s |
| Pauze na een alinea | Extra wachten na een nieuwe regel | 1,5 s |
| Tikfouten | Hoe vaak hij een verkeerde letter typt (een letter die er op het toetsenbord naast ligt). Soms typt hij nog 1–2 letters door en wist hij dan terug, zoals een mens doet. | 2 per 100 woorden |
| Aftellen voor start | Tijd om nog in je document te tikken nadat je op Start hebt gedrukt | 3 s |
| Methode | Hoe de letters naar Google Docs gaan. Laat dit op **Automatisch** staan. Met **Test** typt hij "Test" en wist hij het meteen weer, zodat je kunt zien of het werkt. | Automatisch |

Je kunt de instellingen ook veranderen **terwijl** hij aan het typen is. De nieuwe snelheid gaat dan meteen in.

---

## Versiegeschiedenis

De Auto Typer typt in je eigen, ingelogde Google Docs. Google Docs ziet het dus als jouw typen. Bij **Bestand → Versiegeschiedenis** staat jouw naam, en kun je zien hoe de tekst stukje voor stukje ontstaat.

---

## Tips

- **Houd Safari open en je scherm aan.** Ga je naar een andere app of gaat je iPad op slot, dan stopt het typen tot je terugkomt. De Auto Typer probeert je scherm zelf aan te houden. Werkt dat niet, zet dan *Automatisch slot* op *Nooit*: **Instellingen → Beeldscherm en helderheid → Automatisch slot**.
- **Tik niet in je document tijdens het typen.** Doe je dat wel, dan gaat hij verder op de plek waar je tikte. Pauzeer eerst.
- Google Docs past sommige dingen automatisch aan, net als wanneer je zelf typt. Een regel die begint met `1. ` of `- ` wordt een lijst, en "rechte" aanhalingstekens worden “krulletjes”. Wil je dat niet? Zet het uit bij **Extra → Voorkeuren**.
- Opmaak zoals vet, cursief en kopjes gaat niet mee. Die pas je na afloop zelf aan.

## Werkt het niet?

| Probleem | Oplossing |
|---|---|
| Ik zie het paneel niet | Controleer of de Userscripts-extensie aanstaat en toestemming heeft voor docs.google.com (stap 3). Herlaad daarna de pagina. |
| Het paneel is er, maar er komt geen tekst | Tik eerst in je document en druk dan bij Instellingen op **Test**. Lukt het niet? Zet *Methode* op **Tekstinvoer** en druk opnieuw op **Test**. |
| Elke letter komt er twee keer | Zet *Methode* op **Toetsaanslagen**. |
| Ik wil de nieuwste versie | Open de installatielink uit stap 4 opnieuw en installeer opnieuw. |
