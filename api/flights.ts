import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      departure_id,
      arrival_id,
      outbound_date,
      return_date,
      currency = 'USD',
      hl = 'en',
      gl = 'us'
    } = req.query;

    // Validate required parameters
    if (!departure_id || !arrival_id || !outbound_date) {
      return res.status(400).json({
        error: 'Missing required parameters: departure_id, arrival_id, outbound_date'
      });
    }

    // Build query params for PythonAnywhere API
    const params = new URLSearchParams({
      departure_id: departure_id as string,
      arrival_id: arrival_id as string,
      outbound_date: outbound_date as string,
      currency: currency as string,
      hl: hl as string,
      gl: gl as string,
    });

    // Add optional return_date if provided
    if (return_date) {
      params.append('return_date', return_date as string);
    }

    // Fetch from PythonAnywhere
    const apiUrl = `https://sunidhiyadav69.pythonanywhere.com/flight-result?${params.toString()}`;
    console.log('Proxying request to:', apiUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      console.error('PythonAnywhere API error:', response.status, response.statusText);
      return res.status(response.status).json({
        error: `Failed to fetch flights: ${response.statusText}`
      });
    }

    const data = await response.json();

    // Return the data
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error in flights API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
