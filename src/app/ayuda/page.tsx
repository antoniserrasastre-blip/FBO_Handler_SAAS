"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Search,
  AlertTriangle,
  Info,
  Sunrise,
  Sandwich,
  Moon,
  Luggage,
  Shield,
  Shirt,
  UserCheck,
  Briefcase,
  Car,
  KeyRound,
  UtensilsCrossed,
  Utensils,
  Package,
  ShieldCheck,
  ShieldAlert,
  PlaneLanding,
  PlaneTakeoff,
  Building2,
  Globe,
  FileText,
  ParkingCircle,
  type LucideProps,
} from "lucide-react";
import { MANUAL_SECTIONS, ManualSection } from "@/lib/manualContent";

const ICON_MAP: Record<string, React.FC<LucideProps>> = {
  book: BookOpen,
  sunrise: Sunrise,
  sandwich: Sandwich,
  moon: Moon,
  luggage: Luggage,
  shield: Shield,
  shirt: Shirt,
  userCheck: UserCheck,
  briefcase: Briefcase,
  car: Car,
  key: KeyRound,
  catering: UtensilsCrossed,
  dishes: Utensils,
  package: Package,
  police: ShieldCheck,
  shieldAlert: ShieldAlert,
  landing: PlaneLanding,
  takeoff: PlaneTakeoff,
  office: Building2,
  globe: Globe,
  doc: FileText,
  parking: ParkingCircle,
};

export default function AyudaPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(["apertura"]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MANUAL_SECTIONS;
    return MANUAL_SECTIONS.filter((s) => {
      if (s.title.toLowerCase().includes(q)) return true;
      if (s.subtitle?.toLowerCase().includes(q)) return true;
      return s.blocks.some((b) => {
        if (b.type === "text" || b.type === "heading" || b.type === "callout") {
          return b.text.toLowerCase().includes(q);
        }
        if (b.type === "list") {
          return b.items.some((i) => i.toLowerCase().includes(q));
        }
        return false;
      });
    });
  }, [query]);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setOpenIds(new Set(MANUAL_SECTIONS.map((s) => s.id)));
  }

  function collapseAll() {
    setOpenIds(new Set());
  }

  const isSearching = query.trim().length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto max-w-4xl px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              <ArrowLeft size={14} />
              Volver
            </button>
            <h1 className="flex items-center gap-2 text-sm font-bold text-gray-900 sm:text-base">
              <BookOpen size={18} className="text-orange-500" />
              Manual
              <span className="hidden text-xs font-normal text-gray-400 sm:inline">
                MALLORCAIR 2026
              </span>
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={expandAll}
                className="rounded-md bg-gray-100 px-1.5 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-200 sm:px-2 sm:text-xs"
              >
                Abrir
              </button>
              <button
                onClick={collapseAll}
                className="rounded-md bg-gray-100 px-1.5 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-200 sm:px-2 sm:text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="relative mt-2">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar (gendec, vajilla, pasaporte...)"
              className="w-full rounded-md border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-3 py-4 sm:px-4 sm:py-6">
        {filtered.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            Ningun resultado para &quot;{query}&quot;
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((section) => {
            const open = isSearching || openIds.has(section.id);
            const Icon = ICON_MAP[section.icon] ?? FileText;
            return (
              <section
                key={section.id}
                className={`overflow-hidden rounded-lg border bg-white ${
                  section.highlight
                    ? "border-orange-200 shadow-sm ring-1 ring-orange-100"
                    : "border-gray-200"
                }`}
              >
                <button
                  onClick={() => toggle(section.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50 sm:px-4 sm:py-3"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Icon
                      size={18}
                      className={section.highlight ? "text-orange-500" : "text-gray-500"}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-sm font-semibold text-gray-900 sm:text-base">
                          {section.title}
                        </h2>
                        {section.highlight && (
                          <span className="hidden rounded bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-orange-700 sm:inline">
                            Destacado
                          </span>
                        )}
                      </div>
                      {section.subtitle && (
                        <p className="truncate text-xs text-gray-500">
                          {section.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                  {open ? (
                    <ChevronDown size={16} className="shrink-0 text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="shrink-0 text-gray-400" />
                  )}
                </button>

                {open && (
                  <div className="border-t border-gray-100 px-3 py-3 sm:px-4 sm:py-4">
                    <SectionBody section={section} highlightQuery={query.trim()} />
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <footer className="mt-6 rounded-lg border border-gray-200 bg-white p-3 text-center text-[11px] text-gray-400 sm:text-xs">
          Fuente: MANUAL FILTRO 2026 + SOP Equipaje Controlado + Condiciones
          aparcamiento PMI - MALLORCAIR S.L. LEPA/PMI
        </footer>
      </main>
    </div>
  );
}

function SectionBody({
  section,
  highlightQuery,
}: {
  section: ManualSection;
  highlightQuery: string;
}) {
  return (
    <div className="space-y-3 text-sm text-gray-700">
      {section.blocks.map((block, idx) => {
        if (block.type === "heading") {
          return (
            <h3
              key={idx}
              className="text-sm font-semibold text-gray-900 first:mt-0 mt-2"
            >
              {highlight(block.text, highlightQuery)}
            </h3>
          );
        }
        if (block.type === "text") {
          return (
            <p key={idx} className="leading-relaxed">
              {highlight(block.text, highlightQuery)}
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul
              key={idx}
              className="list-disc space-y-1.5 pl-5 leading-relaxed"
            >
              {block.items.map((item, i) => (
                <li key={i}>{highlight(item, highlightQuery)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "callout") {
          const tone =
            block.tone === "danger"
              ? "border-red-200 bg-red-50 text-red-800"
              : block.tone === "warning"
                ? "border-orange-200 bg-orange-50 text-orange-800"
                : "border-blue-200 bg-blue-50 text-blue-800";
          const CalloutIcon = block.tone === "info" ? Info : AlertTriangle;
          return (
            <div
              key={idx}
              className={`flex gap-2 rounded-md border px-3 py-2 text-xs font-medium ${tone}`}
            >
              <CalloutIcon size={14} className="mt-0.5 shrink-0" />
              <span>{highlight(block.text, highlightQuery)}</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const q = query.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-gray-900">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
