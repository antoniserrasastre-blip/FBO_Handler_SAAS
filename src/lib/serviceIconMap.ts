// Maps the domain `ServiceType` enum (CATERING, COOLER_BAG, …) to the Helix
// `ServiceKey` icon catalog. Items that don't have an exact pictogram fall
// back to a sensible category icon.

import type { ServiceKey } from "@/components/helix/ServiceIcons";
import type { ServiceType } from "@/types";

export const SERVICE_TYPE_TO_ICON: Record<ServiceType, ServiceKey> = {
  CATERING: "catering",
  DISHES: "catering",
  COOLER_BAG: "catering",
  STORAGE_BAG: "cargo",
  LAUNDRY: "laundry",
  THERMOS: "coffee",
  NEWSPAPERS: "vip",       // rough; press = premium amenity in our world
  WATER: "water",
  GPU: "gpu",
  ICE: "water",
  CLEANING: "cleaning",
  STAIRS: "stairs",
  ASU: "ac",
  CUSTOM: "cargo",
};

export function iconForServiceType(type: string): ServiceKey {
  return SERVICE_TYPE_TO_ICON[type as ServiceType] ?? "cargo";
}
