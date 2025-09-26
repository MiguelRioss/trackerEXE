const URL = "https://api-backend-mesodose-2.onrender.com/api/orders";

export async function fetchOrders() {
  const res = await fetch(URL, {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GET ${URL} -> ${res.status} ${txt}`);
  }

  return res.json();
}

