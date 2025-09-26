// Simple: exact label matches for all 5 statuses; copy date/time if present
export default function transformLeftRowsToStatus(obj) {
    const rows = Array.isArray(obj) ? obj : [];

    const find = (label) => rows.find(r => r && r.label === label) || null;
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
            acceptedInCtt: build(find("Aguarda entrada nos CTT")),
            in_transit: build(find("Em trânsito")),
            waitingToBeDelivered: build(find("Em espera")),
            delivered: build(find("Entregue")),
        
    };
}
