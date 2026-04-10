export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const SQUARE_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
  if (!SQUARE_TOKEN) return res.status(500).json({ error: "Server config error: missing SQUARE_ACCESS_TOKEN" });

  try {
    const { items, deliveryFee, deliveryTierLabel, dateStr, orderNote, email, phone, totalWithTax } = req.body;

    if (!items || !items.length || !dateStr) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const itemDesc = items.map(i => i.name + " x" + i.quantity + " (feeds " + (i.feeds * i.quantity) + ")").join(" + ");
    const fullName = "Party Kit: " + itemDesc + (deliveryFee > 0 ? " + Delivery" : "") + " + Tax — " + dateStr;

    const idempotencyKey = "pk-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);

    const squareBody = {
      idempotency_key: idempotencyKey,
      quick_pay: {
        name: fullName.substring(0, 250),
        price_money: {
          amount: Math.round(totalWithTax * 100),
          currency: "USD",
        },
        location_id: "LAZBMZE47YGJ1",
      },
      checkout_options: {
        ask_for_shipping_address: true,
      },
      payment_note: (orderNote || "").substring(0, 500),
    };

    if (email || phone) {
      squareBody.pre_populated_data = {};
      if (email) squareBody.pre_populated_data.buyer_email = email;
      if (phone) {
        let cleanPhone = phone.replace(/[^0-9]/g, "");
        if (cleanPhone.length === 10) cleanPhone = "1" + cleanPhone;
        if (!cleanPhone.startsWith("+")) cleanPhone = "+" + cleanPhone;
        squareBody.pre_populated_data.buyer_phone_number = cleanPhone;
      }
    }

    console.log("Calling Square API with token starting:", SQUARE_TOKEN.substring(0, 10) + "...");
    console.log("Request body:", JSON.stringify(squareBody));

    const response = await fetch(
      "https://connect.squareup.com/v2/online-checkout/payment-links",
      {
        method: "POST",
        headers: {
          "Square-Version": "2025-01-23",
          "Authorization": "Bearer " + SQUARE_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(squareBody),
      }
    );

    const data = await response.json();
    console.log("Square response status:", response.status);
    console.log("Square response:", JSON.stringify(data));

    if (data.payment_link && data.payment_link.url) {
      return res.status(200).json({ url: data.payment_link.url });
    } else {
      return res.status(500).json({ 
        error: "Failed to create payment link", 
        details: data.errors,
        debug: { status: response.status, tokenPrefix: SQUARE_TOKEN.substring(0, 10) }
      });
    }
  } catch (err) {
    console.error("Function error:", err.message);
    return res.status(500).json({ error: "Internal server error: " + err.message });
  }
}
