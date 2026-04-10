export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  if (!SQUARE_TOKEN) return res.status(500).json({ error: "Server config error" });

  try {
    const { items, deliveryFee, deliveryTierLabel, dateStr, orderNote, email, phone } = req.body;

    if (!items || !items.length || !dateStr) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Build line items for the order
    const lineItems = items.map((item) => ({
      name: item.name + " (feeds " + item.feeds + ")",
      quantity: String(item.quantity),
      base_price_money: { amount: item.price * 100, currency: "USD" },
    }));

    // Add delivery as a line item
    if (deliveryFee > 0) {
      lineItems.push({
        name: "Delivery (" + deliveryTierLabel + ")",
        quantity: "1",
        base_price_money: { amount: deliveryFee * 100, currency: "USD" },
      });
    }

    const idempotencyKey = "pk-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);

    const squareBody = {
      idempotency_key: idempotencyKey,
      order: {
        location_id: "LAZBMZE47YGJ1",
        line_items: lineItems,
        metadata: {
          delivery_date: dateStr,
          source: "party-kits-web",
        },
      },
      checkout_options: {
        ask_for_shipping_address: true,
        redirect_url: "https://happylobsterchicago.com/party-kits",
      },
      payment_note: orderNote || "",
    };

    if (email || phone) {
      squareBody.pre_populated_data = {};
      if (email) squareBody.pre_populated_data.buyer_email = email;
      if (phone) squareBody.pre_populated_data.buyer_phone_number = phone;
    }

    const response = await fetch(
      "https://connect.squareup.com/v2/online-checkout/payment-links",
      {
        method: "POST",
        headers: {
          "Square-Version": "2025-01-23",
          Authorization: "Bearer " + SQUARE_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(squareBody),
      }
    );

    const data = await response.json();

    if (data.payment_link && data.payment_link.url) {
      return res.status(200).json({ url: data.payment_link.url });
    } else {
      console.error("Square error:", JSON.stringify(data));
      return res.status(500).json({ error: "Failed to create payment link", details: data.errors });
    }
  } catch (err) {
    console.error("Function error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
