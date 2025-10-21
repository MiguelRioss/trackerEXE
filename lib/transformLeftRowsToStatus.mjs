// Simple: exact label matches for known statuses; copy date/time if present
export default function transformLeftRowsToStatus(obj) {
  const rows = Array.isArray(obj) ? obj : [];

  const find = (label) => rows.find((r) => r && r.label === label) || null;
  const findAny = (labels) => rows.find((r) => r && labels.includes(r.label)) || null;
  const build = (row) =>
    row
      ? {
          status: true,
          ...(row.date ? { date: row.date } : {}),
          ...(row.time ? { time: row.time } : {}),
        }
      : { status: false };

  return {
    accepted: build(find("Aceite")),
    awaiting_ctt: build(find("Aguarda entrada nos CTT")),
    in_transit: build(findAny(["Em trânsito", "Em transito", "Em trǽnsito"])),
    in_delivery: build(findAny(["Em entrega", "Em espera"])),
    delivered: build(find("Entregue")),
  };
}
