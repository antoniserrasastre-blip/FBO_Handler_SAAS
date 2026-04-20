export default function DiaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Route-scoped @page so other pages keep browser defaults. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { background: white !important; }
          table { font-size: 9pt !important; }
        }
      `}</style>
      {children}
    </>
  );
}
