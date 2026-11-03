import { bootstrapApplication } from '@angular/platform-browser';
import { createAppConfig } from './app/app.config';
import { loadAppConfig } from './app/core/config/app-config';
import { App } from './app/app';

loadAppConfig()
  .then((config) => bootstrapApplication(App, createAppConfig(config)))
  .catch((err: unknown) => {
    // Start-up failed (config missing or invalid): say so on the page rather than show a blank screen.
    document.body.textContent = `HK ELI Chatbot could not start: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  });
