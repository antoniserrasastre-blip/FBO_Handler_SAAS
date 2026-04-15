import {
  UtensilsCrossed,
  Wine,
  Snowflake,
  BriefcaseConveyorBelt,
  WashingMachine,
  Coffee,
  Newspaper,
  Sparkles,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  CheckCircle2,
  X,
  AlertTriangle,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  type LucideProps,
} from "lucide-react";
import { ServiceType } from "@/types";

// Service type → icon mapping
const SERVICE_ICON_MAP: Record<ServiceType, React.FC<LucideProps>> = {
  CATERING: UtensilsCrossed,
  DISHES: Wine,
  COOLER_BAG: Snowflake,
  STORAGE_BAG: BriefcaseConveyorBelt,
  LAUNDRY: WashingMachine,
  THERMOS: Coffee,
  NEWSPAPERS: Newspaper,
  CUSTOM: Sparkles,
};

export function ServiceIcon({ type, size = 14, className }: { type: string; size?: number; className?: string }) {
  const Icon = SERVICE_ICON_MAP[type as ServiceType] || Sparkles;
  return <Icon size={size} className={className} />;
}

// State indicators
export function PendingIcon({ size = 14, className }: { size?: number; className?: string }) {
  return <Circle size={size} className={className || "text-gray-400"} />;
}

export function ArrivedIcon({ size = 14, className }: { size?: number; className?: string }) {
  return <CircleDot size={size} className={className || "text-blue-500"} />;
}

export function DeliveredIcon({ size = 14, className }: { size?: number; className?: string }) {
  return <CheckCircle2 size={size} className={className || "text-green-600"} />;
}

// Navigation
export { ChevronUp, ChevronDown, ChevronLeft, ChevronRight };

// Actions
export { X as CloseIcon, AlertTriangle as AlertIcon };

// File types
export { FileText as PdfIcon, FileSpreadsheet as ExcelIcon };

// Success
export { CheckCircle as SuccessIcon };
