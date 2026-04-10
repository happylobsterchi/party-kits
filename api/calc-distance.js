export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const API_KEY = process.env.GOOGLE_MAPS_KEY;
  if (!API_KEY) return res.status(500).json({ error: "Server config error: no maps key" });

  try {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: "Address is required" });

    const origin = encodeURIComponent("2300 S Throop St, Chicago, IL 60608");
    const dest = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${dest}&units=imperial&key=${API_KEY}`;

    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status === "OK" && data.rows[0].elements[0].status === "OK") {
      const distMeters = data.rows[0].elements[0].distance.value;
      const miles = Math.round(distMeters / 1609.34);
      const distText = data.rows[0].elements[0].distance.text;
      const duration = data.rows[0].elements[0].duration.text;

      let fee = null;
      let label = "";
      if (miles <= 15) { fee = 20; label = "Within 15 mi"; }
      else if (miles <= 30) { fee = 30; label = "16–30 mi"; }
      else if (miles <= 50) { fee = 40; label = "31–50 mi"; }
      else { fee = null; label = "50+ mi"; }

      return res.status(200).json({ miles, fee, label, distText, duration });
    } else {
      const errMsg = data.rows?.[0]?.elements?.[0]?.status || data.status || "Unknown error";
      return res.status(400).json({ error: "Couldn't calculate distance: " + errMsg });
    }
  } catch (err) {
    console.error("Distance calc error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
