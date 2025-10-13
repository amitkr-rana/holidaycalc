import type { VercelRequest, VercelResponse } from '@vercel/node';

// In-memory cache for airport search results (infinite duration)
const cache = new Map<string, any>();

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.query;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({
      error: 'Missing required parameter: query'
    });
  }

  const apiKey = process.env.VITE_BOOKINGCOM_RAPIDAPI;

  if (!apiKey) {
    return res.status(500).json({ error: 'Booking.com RapidAPI key not configured' });
  }

  // Check cache first (infinite cache - airports don't change)
  const cacheKey = query.toLowerCase();
  const cachedResult = cache.get(cacheKey);

  if (cachedResult) {
    return res.status(200).json({
      airports: cachedResult,
      cached: true
    });
  }

  try {
    const url = `https://booking-com15.p.rapidapi.com/api/v1/flights/searchDestination?query=${encodeURIComponent(query)}`;
    const options = {
      method: 'GET',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'booking-com15.p.rapidapi.com'
      }
    };

    const response = await fetch(url, options);

    if (!response.ok) {
      throw new Error(`Booking.com API request failed with status ${response.status}`);
    }

    const data = await response.json();

    // Extract and format airport data
    const airports = data.data || [];

    // Cache the result (infinite - airports don't change)
    cache.set(cacheKey, airports);

    // Return airports array from the response
    return res.status(200).json({
      airports: airports,
      cached: false
    });
  } catch (error) {
    console.error('Error fetching airport data:', error);
    return res.status(500).json({
      error: 'Failed to fetch airport data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
