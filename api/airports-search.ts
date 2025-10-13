import type { VercelRequest, VercelResponse } from '@vercel/node';

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

  const apiKey = process.env.VITE_SERPAPI_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'SerpAPI key not configured' });
  }

  try {
    const params = new URLSearchParams({
      engine: 'google_flights',
      q: query,
      api_key: apiKey,
    });

    const response = await fetch(`https://serpapi.com/search?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`SerpAPI request failed with status ${response.status}`);
    }

    const data = await response.json();

    // Return airports array from the response
    return res.status(200).json({
      airports: data.airports || []
    });
  } catch (error) {
    console.error('Error fetching airport data:', error);
    return res.status(500).json({
      error: 'Failed to fetch airport data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
