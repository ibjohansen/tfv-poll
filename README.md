# Turufjell vel - medlemsundersøkelse

En enkel medlemsundersøkelse bygget med Next.js, React, Node og Neon Postgres.

## Krav

- Node.js 20.9 eller nyere
- npm
- En Neon-konto og database

## Lokal oppstart

```bash
npm install
cp .env.example .env.local
npm run dev
```

Åpne deretter `http://localhost:3000`.

## Database

1. Opprett et prosjekt i Neon.
2. Åpne SQL Editor.
3. Kjør innholdet i `database/schema.sql`.
4. Trykk `Connect` i Neon og kopier connection string.
5. Legg den i `.env.local`:

```env
DATABASE_URL=postgresql://...
```

## Dokumenter

Legg PDF-er eller andre filer i:

```text
public/dokumenter/
```

Registrer dem deretter i `data/survey.js` i arrayet `surveyDocuments`.

Eksempel:

```js
export const surveyDocuments = [
  {
    title: "Informasjon om Kristnatten",
    description: "Relevant bakgrunnsdokument før du svarer.",
    href: "/dokumenter/kristnatten.pdf",
    meta: "PDF",
  },
];
```

## GitHub

Hvis prosjektet allerede ligger lokalt:

```bash
git init
git add .
git commit -m "Initial version of Turufjell survey"
git branch -M main
git remote add origin https://github.com/ibjohansen/turufjell-medlemsundersokelse.git
git push -u origin main
```

Alternativt kan du bruke GitHub CLI:

```bash
gh auth login
gh repo create ibjohansen/turufjell-medlemsundersokelse --private --source=. --remote=origin --push
```

## Deploy på Netlify

1. Logg inn på Netlify med GitHub.
2. Velg `Add new project` / `Import an existing project`.
3. Velg GitHub og repositoryet `turufjell-medlemsundersokelse`.
4. Netlify gjenkjenner Next.js automatisk.
5. Legg til miljøvariabelen `DATABASE_URL` under prosjektets environment variables.
6. Deploy.

Hver push til `main` vil deretter utløse en ny produksjonsdeploy.

## Se svar i Neon

I Neon SQL Editor kan du for eksempel kjøre:

```sql
SELECT *
FROM survey_responses
ORDER BY created_at DESC;
```

En enkel opptelling:

```sql
SELECT
  q1,
  COUNT(*) AS antall
FROM survey_responses
GROUP BY q1
ORDER BY antall DESC;
```

## Viktig før bred utsending

Denne første versjonen er anonym og har ikke medlemsautentisering. Dersom resultatene skal brukes som dokumentasjon i en konflikt eller juridisk prosess, bør neste versjon få en mekanisme som begrenser hvem som kan svare og hvor mange ganger, for eksempel unike medlemslenker eller engangskoder.
