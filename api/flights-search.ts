import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { departure_id, arrival_id, outbound_date, return_date, currency = 'USD', travel_class = 1 } = req.body;

  // Validate required parameters
  if (!departure_id || !arrival_id || !outbound_date) {
    return res.status(400).json({
      error: 'Missing required parameters: departure_id, arrival_id, and outbound_date are required'
    });
  }

  const apiKey = process.env.VITE_SERPAPI_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'SerpAPI key not configured' });
  }

  try {
    const params = new URLSearchParams({
      engine: 'google_flights',
      departure_id,
      arrival_id,
      outbound_date,
      currency,
      hl: 'en',
      api_key: apiKey,
    });

    if (return_date) {
      params.append('return_date', return_date);
    }

    if (travel_class) {
      params.append('travel_class', String(travel_class));
    }

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`SerpAPI request failed with status ${response.status}`);
    }

    const data = await response.json();

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching flight data:', error);
    return res.status(500).json({
      error: 'Failed to fetch flight data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
