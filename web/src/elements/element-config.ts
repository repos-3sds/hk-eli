import { AppConfig, parseAppConfig } from '../app/core/config/app-config';
import { LaunchRole, isLaunchRole } from '../app/core/session/session.service';

/**
 * Attributes the Digimarkets host can set on <hk-eli-chatbot>. Every one is optional except the API base URL,
 * which has to come from the attribute or from the file at `config-url`.
 */
export const ELEMENT_ATTRIBUTES = [
  'api-base-url',
  'config-url',
  'role',
  'user-name',
  'time-zone',
  'as-of-date',
  'request-timeout-ms',
  'start-tab',
] as const;

export type ElementAttribute = (typeof ELEMENT_ATTRIBUTES)[number];

/** Attributes that only change who is asking; the widget switches in place without restarting. */
export const LIVE_ATTRIBUTES: readonly ElementAttribute[] = ['role', 'user-name'];

export type AttributeReader = (name: ElementAttribute) => string | null;

export interface ElementSettings {
  readonly config: AppConfig;
  readonly role: LaunchRole | null;
  readonly userName: string | null;
  readonly startTab: string;
}

const START_TABS = ['today', 'chat', 'library'];

/**
 * Builds the app config for one element: the defaults (the standalone app's config file), then the file at
 * `config-url` if the host gave one, then the attributes. The result goes through the same check as the
 * standalone app, so a missing or broken value fails loudly at start-up.
 */
export function buildElementSettings(defaults: object, attr: AttributeReader, fromFile: object | null = null): ElementSettings {
  const merged: Record<string, unknown> = { ...defaults, ...(fromFile ?? {}) };

  const api = clean(attr('api-base-url'));
  if (api) merged['gatewayBaseUrl'] = api.replace(/\/+$/, '');
  const timeZone = clean(attr('time-zone'));
  if (timeZone) merged['timeZone'] = timeZone;
  const asOf = clean(attr('as-of-date'));
  if (asOf) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error(`as-of-date must be YYYY-MM-DD, got "${asOf}"`);
    merged['asOfDate'] = asOf;
  }
  const timeout = clean(attr('request-timeout-ms'));
  if (timeout) {
    const ms = Number(timeout);
    if (!Number.isFinite(ms) || ms <= 0) throw new Error(`request-timeout-ms must be a positive number, got "${timeout}"`);
    merged['requestTimeoutMs'] = ms;
  }
  if (!clean(merged['gatewayBaseUrl'] as string | null)) {
    throw new Error('Set the api-base-url attribute (or gatewayBaseUrl in the file at config-url)');
  }

  const role = clean(attr('role'));
  if (role && !isLaunchRole(role)) throw new Error(`role must be wms, pm or tsm, got "${role}"`);
  const tab = clean(attr('start-tab')) ?? 'today';

  return {
    config: parseAppConfig(merged),
    role: isLaunchRole(role) ? role : null,
    userName: clean(attr('user-name')),
    startTab: START_TABS.includes(tab) ? tab : 'today',
  };
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}
