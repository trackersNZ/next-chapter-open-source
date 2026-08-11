# Next Chapter

Next Chapter is a local-first personal progress companion. It turns goals and everyday routines into small quests, tracks momentum with XP and streaks, and keeps personal data on the device by default.

## Features

- daily and one-off tasks;
- career-development quests and reflections;
- medieval-fantasy level coffers, collectible relics, and an outfit-able character;
- a reading and audiobook shelf;
- configurable medication schedules and dose logging;
- weight and optional waist-measurement history;
- installable Progressive Web App support;
- optional closed-app Web Push reminders through Azure Functions.

## Privacy model

The frontend stores progress and reflections in browser `localStorage`. No account or cloud service is required.

The optional push backend stores a browser subscription and upcoming reminder schedule in Azure Table Storage. Medication names and doses may be included in notification payloads, so anyone deploying that backend is responsible for securing the Azure resources and meeting the privacy requirements that apply to their users.

Next Chapter is a tracking tool, not a medical device, and does not provide medical advice. Users should enter only schedules supplied by a qualified clinician or a medication label.

## Run locally

Requirements: Node.js 20 or newer.

```powershell
npm run dev
```

Open [http://localhost:4280](http://localhost:4280). There are no frontend packages to install.

Run all checks with:

```powershell
npm run check
```

The backend has its own dependencies and requires Node.js 22 or newer:

```powershell
cd backend
npm install
npm run check
```

## Deploy the frontend

The app is a zero-build static site. It can be hosted by any static host. For Azure Static Web Apps, use `/` as the app location, leave the API and output locations empty, and retain `staticwebapp.config.json` for navigation fallback and security headers.

Do not deploy an entire development folder without reviewing it first. Publish only tracked application files so local settings, logs, screenshots, and attachments cannot be exposed accidentally.

## Optional push reminders

Copy the backend settings template and add development VAPID keys:

```powershell
cd backend
Copy-Item local.settings.example.json local.settings.json
npm install
node scripts/generate-vapid.js
func start
```

Keep the VAPID private key and Azure connection settings out of source control. Set `push-config.json` to the local Functions origin when testing browser subscriptions.

To provision and publish the backend to Azure, sign in with Azure CLI and Azure Functions Core Tools, then run:

```powershell
./backend/scripts/deploy.ps1 `
  -StaticAppUrl "https://your-app.example" `
  -VapidSubject "mailto:admin@example.com"
```

The script creates a storage account and a Flex Consumption Function App, restricts CORS to the supplied frontend origin, and writes the deployed API URL to `push-config.json`. Review the script and expected Azure costs before running it.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [SECURITY.md](SECURITY.md) for private vulnerability reporting guidance.

## License

Next Chapter is available under the [MIT License](LICENSE).
