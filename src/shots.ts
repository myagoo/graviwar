import { DEFAULT_MULTIPLAYER_SETTINGS } from "./solo-settings";

export const shotChargeAt = (milliseconds: number, settings = DEFAULT_MULTIPLAYER_SETTINGS) => Math.max(0, Math.min(100, Math.floor((milliseconds - settings.tapMs) * 100 / (settings.chargeMs - settings.tapMs))));

export const shotSpeedMultiplier = (charge: number, settings = DEFAULT_MULTIPLAYER_SETTINGS) => charge <= 50
  ? 1 + (Math.sqrt(settings.chargeBoost) - 1) * charge / 50
  : Math.sqrt(settings.chargeBoost) + (settings.chargeBoost - Math.sqrt(settings.chargeBoost)) * (charge - 50) / 50;
