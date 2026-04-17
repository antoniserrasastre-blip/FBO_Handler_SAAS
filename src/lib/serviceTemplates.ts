// Service templates by operator type
// Based on common patterns observed in Excel data:
// - NJE flights with pax almost always have: catering PAX + prensa (STR+GER)
// - NJE flights with crew often have: catering CREW + termo + hielo
// - VistaJet flights often: catering + prensa
// - Flexjet similar to NJE
// - Catering Aire default 08:00

export interface ServiceTemplateItem {
  type: string;
  customName?: string;
  target?: string;
  origin?: string;
  reference?: string;
}

export interface ServiceTemplate {
  id: string;
  label: string;
  description: string;
  items: ServiceTemplateItem[];
}

export const SERVICE_TEMPLATES: Record<string, ServiceTemplate[]> = {
  // NetJets standard
  NJE: [
    {
      id: "nje-pax-full",
      label: "NJE PAX completo",
      description: "Catering PAX + Prensa + Hielo + Termo",
      items: [
        { type: "CATERING", target: "PAX", origin: "NetJets" },
        { type: "NEWSPAPERS", customName: "STR + GER", origin: "MCR" },
        { type: "COOLER_BAG", customName: "Bolsa nevera" },
        { type: "THERMOS", customName: "Termo" },
      ],
    },
    {
      id: "nje-crew",
      label: "NJE CREW",
      description: "Catering CREW + Termo",
      items: [
        { type: "CATERING", target: "CREW", origin: "NetJets" },
        { type: "THERMOS", customName: "Termo" },
      ],
    },
    {
      id: "nje-basic",
      label: "NJE basico",
      description: "Solo catering PAX + Prensa",
      items: [
        { type: "CATERING", target: "PAX", origin: "NetJets" },
        { type: "NEWSPAPERS", customName: "STR + GER", origin: "MCR" },
      ],
    },
  ],

  // VistaJet (VJT / VJH)
  VJT: [
    {
      id: "vjt-full",
      label: "VistaJet completo",
      description: "Catering + Prensa + Termo",
      items: [
        { type: "CATERING", target: "PAX" },
        { type: "NEWSPAPERS", customName: "Prensa" },
        { type: "THERMOS", customName: "Termo" },
      ],
    },
    {
      id: "vjt-basic",
      label: "VistaJet basico",
      description: "Solo catering + prensa",
      items: [
        { type: "CATERING", target: "PAX" },
        { type: "NEWSPAPERS", customName: "Prensa" },
      ],
    },
  ],
  VJH: [], // Uses VJT templates via operator mapping

  // Flexjet
  FJO: [
    {
      id: "fjo-full",
      label: "Flexjet completo",
      description: "Catering + Prensa + Termo",
      items: [
        { type: "CATERING", target: "PAX" },
        { type: "NEWSPAPERS", customName: "Prensa" },
        { type: "THERMOS", customName: "Termo" },
      ],
    },
  ],
  FLJ: [], // Uses FJO templates

  // Jetfly
  JFA: [
    {
      id: "jfa-standard",
      label: "Jetfly estandar",
      description: "Catering + Prensa",
      items: [
        { type: "CATERING", target: "PAX" },
        { type: "NEWSPAPERS", customName: "Prensa" },
      ],
    },
  ],
};

// Generic templates available for any operator
export const GENERIC_TEMPLATES: ServiceTemplate[] = [
  {
    id: "catering-aire-default",
    label: "Catering Aire",
    description: "Pedido estandar a Catering Aire",
    items: [
      { type: "CATERING", origin: "Catering Aire" },
    ],
  },
  {
    id: "prensa-termo-hielo",
    label: "Prensa + Termo + Hielo",
    description: "Extras comunes",
    items: [
      { type: "NEWSPAPERS", customName: "Prensa" },
      { type: "THERMOS", customName: "Termo" },
      { type: "COOLER_BAG", customName: "Bolsa nevera" },
    ],
  },
];

/**
 * Get available templates for a given operator ICAO prefix.
 * Returns generic + operator-specific templates.
 */
export function getTemplatesForOperator(operatorIcao: string | null): ServiceTemplate[] {
  if (!operatorIcao) return GENERIC_TEMPLATES;

  // Map aliases: VJH→VJT, FLJ→FJO
  const aliases: Record<string, string> = { VJH: "VJT", FLJ: "FJO" };
  const key = aliases[operatorIcao] || operatorIcao;

  const operatorSpecific = SERVICE_TEMPLATES[key] || [];
  return [...operatorSpecific, ...GENERIC_TEMPLATES];
}
