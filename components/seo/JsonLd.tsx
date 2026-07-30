export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] | null }) {
  if (!data) return null;
  const payload = Array.isArray(data) ? data : [data];
  return (
    <>
      {payload.map((item, i) => {
        // Évite de casser le HTML si une description contient </script>
        const json = JSON.stringify(item).replace(/</g, "\\u003c");
        return (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: json }}
          />
        );
      })}
    </>
  );
}
