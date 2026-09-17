# Ikoner i grensesnittet

Ikonene er i hovedsak små SVG-er definert direkte i React-komponentene,
ikke et installert ikonbibliotek. Det finnes derfor ingen ekstern katalog som
viser nøyaktig dagens ikonutvalg.

For å velge erstatninger kan du bruke [Heroicons](https://heroicons.com/)
eller [Lucide](https://lucide.dev/icons/). Begge tilbyr søkbare SVG-ikoner.
Oppgi ikonnavn og hvor det skal brukes; vi kan gjenbruke SVG uten en ny pakke.

| Plassering | Kode |
| --- | --- |
| Administrasjonsmeny og oversiktskort | `components/AdminModuleHeader.js`, `ModuleIcon` |
| Karusellpiler og pause | `components/HomeHeroCarousel.js` |
| Språkvelger | `components/LanguageSwitcher.js` |
| Meny på forsiden | `components/SiteMenu.js` |
| Artikkelkort uten bilde | `components/PublicArticleDirectory.js` |
| Opplasting av artikkelbilde | `components/CmsPageDirectory.js` |
| Felles dropdownpil | `components/Select.js` og `.shared-select-chevron` i `app/globals.css` |

Dekorative SVG-er skal fortsatt ha `aria-hidden="true"`. Knapper trenger et
lesbart navn uavhengig av valgt ikon. Kartets Leaflet-kontroller tilhører
kartbiblioteket, ikke en felles ikonpakke.
