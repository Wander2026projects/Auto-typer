# ⌨️ Auto Typer voor Google Docs (iPad)

Typt je tekst letter voor letter in een Google Doc, alsof je hem zelf typt. Je stelt zelf in:

- hoe snel hij typt (**woorden per minuut**), of in één keer met **Snelkeuze**: Rustig, Gemiddeld of Snel
- **menselijke variatie** (niet robotachtig: de tijd tussen letters wisselt)
- **natuurlijk ritme**: bekende woorden gaan sneller, hoofdletters en cijfers langzamer
- **pauzes** na een zin en na een alinea
- **tikfouten** die hij meteen zelf verbetert
- **zinnen herschrijven**: soms gaat hij 1–3 zinnen terug en verbetert hij een zin
- **snel typen in stukjes**: een paar woorden snel, even nadenken, dan weer verder
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

Onder het tekstvak staan twee schakelaars:

| Schakelaar | Wat het doet |
|---|---|
| Zinnen herschrijven | Typt soms eerst een kladversie van een zin, typt 1–3 zinnen verder, gaat dan terug en verbetert de zin. Meer uitleg hieronder. |
| Snel typen in stukjes | Typt steeds 1–4 woorden snel achter elkaar, denkt dan even na, en gaat weer verder. Meer uitleg hieronder. |

Tijdens het typen kun je deze schakelaars niet veranderen. Zet ze goed voordat je op Start drukt.

### Instellingen

| Instelling | Uitleg | Standaard |
|---|---|---|
| Snelkeuze | **Rustig**, **Gemiddeld** of **Snel** zet snelheid, variatie, pauzes, tikfouten en denkpauzes in één keer. Daarna kun je nog zelf schuiven. Het knopje licht op zolang alles nog precies op dat profiel staat. | Gemiddeld |
| Snelheid | Woorden per minuut (10–300). Een gemiddeld mens typt 35–45. | 45 |
| Menselijke variatie | 0% = elke letter precies even snel (robot). Hoe hoger, hoe natuurlijker en ongelijker. Hij neemt soms ook even "denktijd" voor een woord. | 50% |
| Natuurlijk ritme | Korte, bekende woorden (*de, het, een, the, and…*) en dubbele letters gaan sneller. Lange woorden, hoofdletters, cijfers en leestekens gaan langzamer, en het begin van een woord ook even. De eerste zinnen gaan wat rustiger (opwarmen). Gemiddeld blijft je snelheid gelijk. | aan |
| Pauze na een zin | Extra wachten na `.` `!` `?` (na een komma ongeveer een derde hiervan) | 0,6 s |
| Pauze na een alinea | Extra wachten na een nieuwe regel | 1,5 s |
| Tikfouten | Hoe vaak hij een verkeerde letter typt (een letter die er op het toetsenbord naast ligt). Soms typt hij nog 1–2 letters door en wist hij dan terug, zoals een mens doet. | 2 per 100 woorden |
| Zinnen herschrijven → Hoe vaak | Hoeveel zinnen hij eerst als kladversie typt | ongeveer 1 op de 10 zinnen |
| Zinnen herschrijven → Hoe verbeteren | **Hele zin wissen en opnieuw typen**, **Alleen het verschil aanpassen**, of **Afwisselend** (elke keer willekeurig één van de twee) | Afwisselend |
| Denkpauze tussen stukjes | Voor Snel typen in stukjes: hoe lang hij nadenkt tussen twee stukjes | 1 s |
| Leespauze | Hoe lang hij even "leest" voordat hij iets verandert: in de Verbeter-typer en voordat hij een zin herschrijft | 2 s |
| Aftellen voor start | Tijd om nog in je document te tikken nadat je op Start hebt gedrukt | 3 s |
| Methode | Hoe de letters naar Google Docs gaan. Laat dit op **Automatisch** staan. Met **Test** typt hij "Test" en wist hij het meteen weer, zodat je kunt zien of het werkt. | Automatisch |

Je kunt de instellingen ook veranderen **terwijl** hij aan het typen is. De nieuwe snelheid gaat dan meteen in.

---

## ↩️ Zinnen herschrijven

Zet de schakelaar **Zinnen herschrijven** aan op het tabblad Auto typer. Dan typt hij af en toe eerst een **kladversie** van een zin, en verbetert hij die later:

1. Hij typt een kladversie van de zin. Bijvoorbeeld met een woord vergeten, een ander woord, een woordje te veel, twee woorden omgedraaid, of een zin die nog niet af is.
2. Hij typt gewoon door: 1, 2 of 3 zinnen (willekeurig).
3. Hij "leest" even terug (de **Leespauze**), gaat met de cursor terug naar de kladzin en verbetert hem. Afhankelijk van **Hoe verbeteren** wist hij de hele zin en typt hij hem opnieuw, of past hij alleen het stukje aan dat anders is.
4. Daarna gaat hij terug naar waar hij was en typt hij verder.

| Jouw zin | Kladversie |
|---|---|
| We gingen met de trein, omdat dat het snelst was. | We gingen met de trein, want dat het snelst was. |
| Het museum was echter groter dan ik had gedacht. | Het museum was toch groter dan ik had gedacht. |
| Ik fiets elke dag naar school. | Ik fiets elke dag. |
| It was very cold in the mornings. | It was basically very cold in the mornings. |

**Aan het eind staat je tekst er altijd precies zo als je hem hebt geplakt.** De kladversie bedenkt hij zelf, je hoeft niets extra's te doen. Hij werkt met Nederlandse en Engelse tekst.

Goed om te weten:
- Hij gaat alleen terug binnen **dezelfde alinea**. Zinnen met minder dan 4 woorden slaat hij over.
- Zinnen met emoji, of met iets dat Google Docs zelf vervangt (zoals `(c)`, `->`, `...` of `1/2`), herschrijft hij niet. Daar zou het tellen van de cursorstappen mis kunnen gaan.
- In het paneel zie je hoeveel zinnen hij gaat herschrijven, en de tijdschatting telt dat mee. Druk je nog een keer op Start, dan kiest hij andere zinnen.
- **Tik niet in je document tijdens het typen of een pauze**, anders gaat hij op de verkeerde plek verbeteren.
- Stop je terwijl er nog een kladzin staat? Dan zegt hij welke zin je even moet nakijken.

---

## ⚡ Snel typen in stukjes

Zet de schakelaar **Snel typen in stukjes** aan op het tabblad Auto typer. Dan typt hij zoals veel mensen echt typen: een paar woorden snel achter elkaar, even nadenken, dan weer een paar woorden.

- Een stukje is steeds **1 tot 4 woorden** (meestal 2 of 3), willekeurig, zodat er geen vast patroon in zit.
- Hoe lang hij nadenkt, stel je in bij **Instellingen → Denkpauze tussen stukjes**.
- Na een punt, komma of nieuwe alinea begint ook een nieuw stukje. Daar gebruikt hij de gewone pauze na een zin of alinea.
- **Je gemiddelde snelheid blijft gelijk.** Hij typt de stukjes sneller dan je ingestelde snelheid, zodat de denkpauzes dat weer goedmaken. Hoe langer de denkpauze, hoe sneller de stukjes. Sneller dan ongeveer 3× je ingestelde snelheid gaat hij niet. Bij een hoge snelheid met een lange denkpauze wordt het gemiddelde dus wat lager. De tijdschatting houdt daar rekening mee.
- Dit werkt alleen in het tabblad Auto typer, niet in de Verbeter-typer.

---

## ✏️ Verbeter-typer

Staat je tekst al in je document en heb je een verbeterde versie? Dan past de Verbeter-typer **alleen de veranderde stukken** aan. Hij hoeft dus niet alles opnieuw te typen. Hij kan woorden vervangen, toevoegen en weghalen, zinnen herschrijven, en alinea's toevoegen of weghalen.

1. Tik bovenaan het paneel op het tabblad **Verbeter-typer**.
2. **Vak 1 – Tekst nu in je document:** kopieer in Google Docs je hele tekst (**Bewerken → Alles selecteren**, dan **kopiëren**) en plak hem hier.
3. **Vak 2 – Nieuwe tekst:** plak hier je verbeterde versie.
4. Onder **Wat er verandert** zie je wat hij gaat doen: wat ~~rood doorgestreept~~ is haalt hij weg, wat groen is typt hij erbij.
5. Druk op **▶ Start** en **tik daarna niet meer in je document**. Hij zoekt zelf het begin van je document op en werkt van boven naar beneden.

Bij elke wijziging zet hij de cursor op de goede plek, wist hij het oude stuk letter voor letter, typt hij het nieuwe stuk (met jouw snelheid, variatie en tikfouten) en "leest" hij even voordat hij naar de volgende wijziging gaat. Hoe lang dat lezen duurt, stel je in bij **Instellingen → Leespauze**. Verandert er maar één woord een klein beetje, zoals "werkt" → "werkte", dan typt hij alleen de "e" erbij.

**Belangrijk:**
- Plak in vak 1 altijd de **hele** tekst uit je document, precies zoals hij nu is.
- Heb je de Verbeter-typer gestopt, of daarna zelf iets veranderd? Kopieer de tekst uit je document dan opnieuw naar vak 1 voordat je weer begint.
- Pauzeer je tussendoor? Tik dan niet in je document, anders komt de volgende wijziging op de verkeerde plek.
- Tabellen en afbeeldingen in je document kunnen het tellen in de war brengen. Gewone tekst, kopjes en opsommingen werken goed.

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
| Zinnen herschrijven verbetert op de verkeerde plek | Tik niet in je document tijdens het typen of tijdens een pauze. Gebeurt het toch? Zet de schakelaar uit en gebruik de Verbeter-typer om je tekst recht te zetten. |
| Verbeter-typer zet wijzigingen op de verkeerde plek | Controleer of vak 1 precies de hele tekst uit je document bevat (opnieuw kopiëren en plakken). Tabellen en afbeeldingen kunnen ook voor problemen zorgen. |
| Ik wil de nieuwste versie | Open de installatielink uit stap 4 opnieuw en installeer opnieuw. |
