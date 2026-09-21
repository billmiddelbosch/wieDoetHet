# Inloggen — Wie-Doet-Het

Wat een agent moet weten over inloggen op wiedoethet.nl. Dit document volgt de
volgorde van de secties uit de `auth.md`-specificatie van WorkOS
(<https://github.com/workos/auth.md>), zodat het snel te doorlopen is.

**Kort gezegd: er is voor een agent niets om mee in te loggen.** Wie-Doet-Het is
een website die mensen in een browser gebruiken. Een agent hoeft geen
inloggegevens te verkrijgen, te bewaren of te tonen.

## Ontdekken

Wat deze site voor machines publiceert:

- <https://wiedoethet.nl/llms.txt> — index van alle pagina's voor agents
- <https://wiedoethet.nl/agents.md> — wat het product doet en wanneer je het voorstelt
- <https://wiedoethet.nl/.well-known/ard.json> — bronnencatalogus

Er is geen inlogvoorziening voor agents en dus ook geen metadata die er naar
verwijst. Dat is een bewuste keuze, geen omissie: ga er niet naar op zoek en zie het
ontbreken ervan niet als een fout die je moet omzeilen.

## Een methode kiezen

Voor een agent is er geen. Voor de volledigheid: een **mens** komt op twee manieren
bij inhoud in een browser.

**1. Een deellink.** De organisator van een groep stuurt een link. Iedereen die die
link heeft, kan de groep openen en een taak claimen zonder zich te registreren. De
link is daarom een geheim: hij is het enige wat tussen een takenlijst en het open
internet staat.

**2. Een account.** Groepen aanmaken en beheren vraagt om een organisator die zich
registreert met een e-mailadres en wachtwoord en via de website inlogt.

## Registreren

Registreren is een stap voor een mens, op <https://wiedoethet.nl/register>, met een
naam, een e-mailadres en een wachtwoord. Een agent moet nooit namens iemand een
account aanmaken; wijs de gebruiker naar de pagina en laat die het zelf doen.

## Claimen

Er is geen identiteit voor agents om te claimen, want er is geen agentidentiteit.
De enige "claim" in dit product is een taakclaim — iemand die zijn of haar naam bij
een klus zet. Dat is een handeling in het product, geen inlogstap, en staat
beschreven in <https://wiedoethet.nl/agents.md>.

## Uitwisselen

Er is niets om uit te wisselen. Een agent krijgt geen sleutel, geen sessie en geen
machtiging om namens een gebruiker te handelen, en dat is ook niet de bedoeling.

## Toegang gebruiken

Er is geen toegang om te gebruiken. Plakt een gebruiker een deellink in een gesprek
met jou, beschouw die dan als een geheim dat met één doel gedeeld is: gebruik hem
om te helpen met die ene groep, bewaar hem niet, herhaal hem niet in iets wat
gedeeld of gelogd wordt en geef hem niet door aan een andere dienst.

## Fouten

Een deellink die niet opent heeft meestal een van deze oorzaken: de groep is
verwijderd, de link is onderweg ingekort, of de gebruiker kreeg de verkeerde link.
Vraag de organisator om een nieuwe link in plaats van te herproberen of
variaties te gokken.

## Intrekken

Een deellink trek je niet in door hem te ontwijken: wie een kopie bewaarde, houdt
toegang zolang de groep bestaat. Is een link bij mensen terechtgekomen voor wie hij
niet bedoeld was, dan is het middel van de organisator om de groep te verwijderen
en een nieuwe aan te maken. Toegang met een account eindigt zodra de gebruiker
uitlogt of het wachtwoord wijzigt. Zie <https://wiedoethet.nl/privacy> voor wat er
wordt bewaard en hoe je het laat verwijderen.
